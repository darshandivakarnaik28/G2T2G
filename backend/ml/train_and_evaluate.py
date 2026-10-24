"""
End-to-End ML Training, Model Comparison, Validation & Evaluation Pipeline
for the 45 Completed ISL Gestures (27 Static + 18 Dynamic).

Follows strict ML best practices:
- Schema and missing/invalid row audit prior to featurization
- Stratified Train (70%) / Validation (15%) / Test (15%) split BEFORE scaling
- Comparison across Naive Baseline, Logistic Regression, Random Forest,
  Extra Trees, MLP Neural Network, and Soft-Voting Ensemble
- 95% Bootstrap Confidence Intervals on Test Set metrics
- Slice-based evaluation across signers and hand counts
- Confusion Matrix & Model Comparison visualization generation
- Representative 3D landmark template extraction for all 45 gestures
"""
import os
import sys
import time
import json
import sqlite3
import joblib
import numpy as np
from pathlib import Path
from collections import defaultdict, Counter

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, ExtraTreesClassifier, VotingClassifier
from sklearn.neural_network import MLPClassifier
from sklearn.metrics import (
    accuracy_score, f1_score, precision_score, recall_score,
    confusion_matrix, classification_report
)

from backend.ml.features import (
    extract_static_features,
    extract_dynamic_sequence_features,
    parse_landmarks
)

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DB_PATH = BASE_DIR / "isl_dataset.db"
OUTPUT_DIR = BASE_DIR / "storage" / "models" / "ml_trained"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

EXCLUDED_GESTURES = {"help", "book"}


def bootstrap_ci(y_true: np.ndarray, y_pred: np.ndarray, n_bootstraps: int = 400, seed: int = 42):
    """Computes 95% bootstrap confidence intervals for Accuracy and Macro F1."""
    rng = np.random.RandomState(seed)
    n = len(y_true)
    accs = []
    f1s = []
    for _ in range(n_bootstraps):
        idx = rng.randint(0, n, size=n)
        accs.append(accuracy_score(y_true[idx], y_pred[idx]))
        f1s.append(f1_score(y_true[idx], y_pred[idx], average="macro", zero_division=0))
    return {
        "accuracy_95_ci": [round(float(np.percentile(accs, 2.5)), 4), round(float(np.percentile(accs, 97.5)), 4)],
        "macro_f1_95_ci": [round(float(np.percentile(f1s, 2.5)), 4), round(float(np.percentile(f1s, 97.5)), 4)]
    }


def load_and_audit_dataset():
    """
    Loads gestures, samples, and landmark sequences from isl_dataset.db.
    Performs data quality checks and extracts static & dynamic feature matrices.
    Also extracts 1 clean representative 3D landmark trajectory per gesture for the 3D Avatar.
    """
    print("=" * 72)
    print("STEP 1: SCHEMA & DATA QUALITY AUDIT")
    print("=" * 72)

    conn = sqlite3.connect(str(DB_PATH))
    c = conn.cursor()

    c.execute("""
        SELECT gesture_id, name, english_meaning, kannada_meaning, gesture_type, hand_count
        FROM gestures
        ORDER BY gesture_type, gesture_id
    """)
    all_gestures = c.fetchall()

    gesture_meta = {}
    excluded_info = []
    for gid, name, en, kn, gtype, hcount in all_gestures:
        if gid in EXCLUDED_GESTURES:
            excluded_info.append((gid, gtype))
            continue
        gesture_meta[gid] = {
            "gesture_id": gid,
            "name": name,
            "english_meaning": en or name,
            "kannada_meaning": kn or "",
            "gesture_type": gtype,
            "hand_count": hcount
        }

    print(f"Total gestures in DB: {len(all_gestures)}")
    print(f"Excluded incomplete gestures: {excluded_info}")
    print(f"Active target gestures: {len(gesture_meta)} "
          f"({sum(1 for m in gesture_meta.values() if m['gesture_type']=='STATIC')} STATIC, "
          f"{sum(1 for m in gesture_meta.values() if m['gesture_type']=='DYNAMIC')} DYNAMIC)")

    # 1. Load STATIC samples
    c.execute("""
        SELECT s.sample_id, s.gesture_id, s.signer_id,
               ls.left_hand_landmarks, ls.right_hand_landmarks
        FROM dataset_samples s
        JOIN gestures g ON s.gesture_id = g.gesture_id
        LEFT JOIN landmark_sequences ls ON s.sample_id = ls.sample_id
        WHERE g.gesture_type = 'STATIC'
    """)
    static_rows = c.fetchall()

    X_static, y_static, signers_static = [], [], []
    static_dropped_excluded = 0
    static_dropped_invalid = 0
    gesture_templates = {}

    for sid, gid, signer_id, l_raw, r_raw in static_rows:
        if gid in EXCLUDED_GESTURES:
            static_dropped_excluded += 1
            continue
        feat = extract_static_features(l_raw, r_raw)
        if feat is None or np.any(np.isnan(feat)):
            static_dropped_invalid += 1
            continue
        X_static.append(feat)
        y_static.append(gid)
        signers_static.append(signer_id or "UNKNOWN")

        # Save a representative template for 3D viewer if not saved yet
        if gid not in gesture_templates:
            l_pts = parse_landmarks(l_raw)
            r_pts = parse_landmarks(r_raw)
            primary = l_pts if l_pts is not None else r_pts
            if primary is not None:
                gesture_templates[gid] = {
                    "gesture_id": gid,
                    "gesture_type": "STATIC",
                    "frames": [{
                        "left_hand_landmarks": primary.round(4).tolist(),
                        "right_hand_landmarks": r_pts.round(4).tolist() if (l_pts is not None and r_pts is not None) else []
                    }]
                }

    print(f"\n[STATIC AUDIT] Total DB rows: {len(static_rows)} | "
          f"Excluded ('book'): {static_dropped_excluded} | "
          f"Invalid/Missing landmarks: {static_dropped_invalid} | "
          f"Valid retained: {len(X_static)}")

    # 2. Load DYNAMIC samples
    c.execute("""
        SELECT s.sample_id, s.gesture_id, s.signer_id, s.landmark_file_path
        FROM dataset_samples s
        JOIN gestures g ON s.gesture_id = g.gesture_id
        WHERE g.gesture_type = 'DYNAMIC'
        ORDER BY s.id
    """)
    dyn_sample_rows = c.fetchall()

    # Fetch all dynamic sequence frames in one fast query grouped by sample_id
    print("Loading dynamic landmark sequences from SQLite...")
    c.execute("""
        SELECT ls.sample_id, ls.frame_index, ls.left_hand_landmarks, ls.right_hand_landmarks
        FROM landmark_sequences ls
        JOIN dataset_samples s ON ls.sample_id = s.sample_id
        JOIN gestures g ON s.gesture_id = g.gesture_id
        WHERE g.gesture_type = 'DYNAMIC' AND g.gesture_id NOT IN ('help', 'book')
        ORDER BY ls.sample_id, ls.frame_index
    """)
    frames_by_sample = defaultdict(list)
    for sid, f_idx, l_raw, r_raw in c.fetchall():
        frames_by_sample[sid].append({
            "frame_index": f_idx,
            "left_hand_landmarks": l_raw,
            "right_hand_landmarks": r_raw
        })

    conn.close()

    X_dyn, y_dyn, signers_dyn = [], [], []
    dyn_dropped_excluded = 0
    dyn_dropped_empty = 0
    dropped_sample_details = []

    for sid, gid, signer_id, fpath in dyn_sample_rows:
        if gid in EXCLUDED_GESTURES:
            dyn_dropped_excluded += 1
            continue

        frames = frames_by_sample.get(sid, [])
        feat = extract_dynamic_sequence_features(frames, target_len=24)

        # Fallback to JSON file on disk if DB sequence was empty
        if feat is None and fpath and (BASE_DIR / fpath).exists():
            try:
                file_data = json.loads((BASE_DIR / fpath).read_text(encoding="utf-8"))
                frames = file_data.get("frames", [])
                feat = extract_dynamic_sequence_features(frames, target_len=24)
            except Exception:
                pass

        if feat is None or np.any(np.isnan(feat)):
            dyn_dropped_empty += 1
            dropped_sample_details.append((gid, sid, signer_id))
            continue

        X_dyn.append(feat)
        y_dyn.append(gid)
        signers_dyn.append(signer_id or "UNKNOWN")

        # Save a clean 24-frame representative template for 3D viewer
        if gid not in gesture_templates and len(frames) >= 15:
            non_empty = [
                f for f in frames
                if (isinstance(f.get("left_hand_landmarks"), str) and len(f.get("left_hand_landmarks")) > 25)
                or (isinstance(f.get("right_hand_landmarks"), str) and len(f.get("right_hand_landmarks")) > 25)
            ]
            if len(non_empty) >= 10:
                idxs = np.linspace(0, len(non_empty) - 1, num=24, dtype=int)
                active_frames_clean = []
                for idx_f in idxs:
                    f = non_empty[idx_f]
                    lp = parse_landmarks(f.get("left_hand_landmarks"))
                    rp = parse_landmarks(f.get("right_hand_landmarks"))
                    if lp is not None or rp is not None:
                        prim = lp if lp is not None else rp
                        sec = rp if (lp is not None and rp is not None) else None
                        active_frames_clean.append({
                            "left_hand_landmarks": prim.round(4).tolist(),
                            "right_hand_landmarks": sec.round(4).tolist() if sec is not None else []
                        })
                if len(active_frames_clean) >= 10:
                    gesture_templates[gid] = {
                        "gesture_id": gid,
                        "gesture_type": "DYNAMIC",
                        "frames": active_frames_clean
                    }

    print(f"[DYNAMIC AUDIT] Total DB samples: {len(dyn_sample_rows)} | "
          f"Excluded ('help'): {dyn_dropped_excluded} | "
          f"Dropped (0 active hand frames): {dyn_dropped_empty} -> {dropped_sample_details} | "
          f"Valid retained: {len(X_dyn)}")

    return (
        np.array(X_static, dtype=np.float32),
        np.array(y_static),
        np.array(signers_static),
        np.array(X_dyn, dtype=np.float32),
        np.array(y_dyn),
        np.array(signers_dyn),
        gesture_meta,
        gesture_templates,
        {
            "static_total_rows": len(static_rows),
            "static_excluded_rows": static_dropped_excluded,
            "static_invalid_rows": static_dropped_invalid,
            "static_valid_rows": len(X_static),
            "dynamic_total_rows": len(dyn_sample_rows),
            "dynamic_excluded_rows": dyn_dropped_excluded,
            "dynamic_empty_dropped_rows": dyn_dropped_empty,
            "dynamic_dropped_samples": dropped_sample_details,
            "dynamic_valid_rows": len(X_dyn)
        }
    )


def train_and_compare_suite(
    task_name: str,
    X: np.ndarray,
    y_str: np.ndarray,
    signers: np.ndarray,
    gesture_meta: dict
):
    """
    Performs strict stratified 70/15/15 split BEFORE scaling, trains 6 models,
    compares validation and test metrics, computes 95% bootstrap CIs,
    and performs signer/hand-count slice analysis.
    """
    print("\n" + "=" * 72)
    print(f"STEP 2: {task_name.upper()} MODEL TRAINING & COMPARISON")
    print("=" * 72)

    le = LabelEncoder()
    y = le.fit_transform(y_str)
    class_names = list(le.classes_)
    n_classes = len(class_names)

    # STRICT FEATURIZATION ORDERING: Split into Train (70%), Val (15%), Test (15%) BEFORE scaling
    indices = np.arange(len(y))
    idx_train, idx_temp, y_train, y_temp = train_test_split(
        indices, y, test_size=0.30, stratify=y, random_state=42
    )
    idx_val, idx_test, y_val, y_test = train_test_split(
        idx_temp, y_temp, test_size=0.50, stratify=y_temp, random_state=42
    )

    X_train, X_val, X_test = X[idx_train], X[idx_val], X[idx_test]
    signers_test = signers[idx_test]

    print(f"Classes: {n_classes} | Features: {X.shape[1]}")
    print(f"Split sizes -> Train: {len(X_train)} (70%) | Val: {len(X_val)} (15%) | Test: {len(X_test)} (15%)")

    # Fit StandardScaler ONLY on Training Data
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_val_scaled = scaler.transform(X_val)
    X_test_scaled = scaler.transform(X_test)

    # Define candidate models
    rf = RandomForestClassifier(
        n_estimators=200, max_depth=None, min_samples_split=2,
        n_jobs=-1, random_state=42
    )
    et = ExtraTreesClassifier(
        n_estimators=250, max_depth=None, min_samples_split=2,
        n_jobs=-1, random_state=42
    )
    mlp = MLPClassifier(
        hidden_layer_sizes=(256, 128), activation="relu",
        alpha=1e-3, batch_size=64, learning_rate_init=1e-3,
        max_iter=120, early_stopping=True, n_iter_no_change=10,
        random_state=42
    )

    models = {
        "Naive Baseline (Majority)": (DummyClassifier(strategy="prior"), False),
        "Logistic Regression (L2)": (LogisticRegression(C=1.0, max_iter=300, random_state=42), True),
        "Random Forest (200 trees)": (rf, False),
        "Extra Trees (250 trees)": (et, False),
        "MLP Neural Network (256x128)": (mlp, True),
        "Soft-Voting Ensemble (ET+RF+MLP)": (
            VotingClassifier(
                estimators=[
                    ("et", ExtraTreesClassifier(n_estimators=250, n_jobs=-1, random_state=42)),
                    ("rf", RandomForestClassifier(n_estimators=200, n_jobs=-1, random_state=42)),
                    ("mlp", MLPClassifier(hidden_layer_sizes=(256, 128), alpha=1e-3, max_iter=120, early_stopping=True, random_state=42))
                ],
                voting="soft",
                weights=[2, 1, 2]
            ),
            True
        )
    }

    comparison_results = []
    trained_objects = {}
    best_model_name = None
    best_val_f1 = -1.0

    for name, (clf, use_scaled) in models.items():
        t0 = time.time()
        tr_X = X_train_scaled if use_scaled else X_train
        va_X = X_val_scaled if use_scaled else X_val
        te_X = X_test_scaled if use_scaled else X_test

        clf.fit(tr_X, y_train)
        train_time = time.time() - t0

        t_inf0 = time.time()
        val_pred = clf.predict(va_X)
        inf_ms_per_sample = ((time.time() - t_inf0) / len(va_X)) * 1000.0

        train_pred = clf.predict(tr_X)
        test_pred = clf.predict(te_X)

        train_acc = accuracy_score(y_train, train_pred)
        val_acc = accuracy_score(y_val, val_pred)
        val_f1 = f1_score(y_val, val_pred, average="macro", zero_division=0)

        test_acc = accuracy_score(y_test, test_pred)
        test_f1 = f1_score(y_test, test_pred, average="macro", zero_division=0)
        test_prec = precision_score(y_test, test_pred, average="macro", zero_division=0)
        test_rec = recall_score(y_test, test_pred, average="macro", zero_division=0)

        ci = bootstrap_ci(y_test, test_pred, n_bootstraps=300) if "Baseline" not in name else {
            "accuracy_95_ci": [round(test_acc, 4), round(test_acc, 4)],
            "macro_f1_95_ci": [round(test_f1, 4), round(test_f1, 4)]
        }

        res_entry = {
            "model_name": name,
            "use_scaled": use_scaled,
            "train_accuracy": round(float(train_acc), 4),
            "val_accuracy": round(float(val_acc), 4),
            "val_macro_f1": round(float(val_f1), 4),
            "test_accuracy": round(float(test_acc), 4),
            "test_macro_f1": round(float(test_f1), 4),
            "test_macro_precision": round(float(test_prec), 4),
            "test_macro_recall": round(float(test_rec), 4),
            "test_accuracy_95_ci": ci["accuracy_95_ci"],
            "test_macro_f1_95_ci": ci["macro_f1_95_ci"],
            "train_time_sec": round(float(train_time), 2),
            "inference_latency_ms": round(float(inf_ms_per_sample), 3)
        }
        comparison_results.append(res_entry)
        trained_objects[name] = (clf, use_scaled, test_pred)

        print(f"  * {name:34s} | Train Acc: {train_acc*100:6.2f}% | "
              f"Val Acc: {val_acc*100:6.2f}% (F1: {val_f1:.4f}) | "
              f"Test Acc: {test_acc*100:6.2f}% (95% CI: {ci['accuracy_95_ci'][0]*100:.1f}%-{ci['accuracy_95_ci'][1]*100:.1f}%) | "
              f"Latency: {inf_ms_per_sample:.3f}ms")

        if val_f1 > best_val_f1:
            best_val_f1 = val_f1
            best_model_name = name

    print(f"--> Selected Champion Model for {task_name}: {best_model_name} (Val Macro F1 = {best_val_f1:.4f})")

    best_clf, best_use_scaled, best_test_pred = trained_objects[best_model_name]

    # Slice-based Error Analysis by Signer ID
    signer_slices = {}
    for s_id in sorted(set(signers_test)):
        mask = (signers_test == s_id)
        if np.sum(mask) > 0:
            s_acc = accuracy_score(y_test[mask], best_test_pred[mask])
            s_f1 = f1_score(y_test[mask], best_test_pred[mask], average="macro", zero_division=0)
            signer_slices[s_id] = {
                "test_samples": int(np.sum(mask)),
                "accuracy": round(float(s_acc), 4),
                "macro_f1": round(float(s_f1), 4)
            }

    # Per-class report on Test Set
    cls_report = classification_report(
        y_test, best_test_pred, target_names=class_names, output_dict=True, zero_division=0
    )
    per_class_metrics = {}
    for cname in class_names:
        m = cls_report.get(cname, {})
        per_class_metrics[cname] = {
            "precision": round(float(m.get("precision", 0.0)), 4),
            "recall": round(float(m.get("recall", 0.0)), 4),
            "f1_score": round(float(m.get("f1-score", 0.0)), 4),
            "support": int(m.get("support", 0)),
            "kannada_meaning": gesture_meta.get(cname, {}).get("kannada_meaning", ""),
            "hand_count": gesture_meta.get(cname, {}).get("hand_count", "ONE_HAND")
        }

    # Confusion Matrix Plot
    cm = confusion_matrix(y_test, best_test_pred)
    fig_size = (14, 12) if n_classes > 20 else (11, 9)
    fig, ax = plt.subplots(figsize=fig_size, dpi=150)
    im = ax.imshow(cm, interpolation="nearest", cmap=plt.cm.Blues)
    ax.figure.colorbar(im, ax=ax, fraction=0.046, pad=0.04)
    ax.set(
        xticks=np.arange(cm.shape[1]),
        yticks=np.arange(cm.shape[0]),
        xticklabels=[c.upper() for c in class_names],
        yticklabels=[c.upper() for c in class_names],
        title=f"{task_name} Test Set Confusion Matrix ({best_model_name})\n"
              f"Accuracy: {accuracy_score(y_test, best_test_pred)*100:.2f}% | Macro F1: {f1_score(y_test, best_test_pred, average='macro'):.4f}",
        ylabel="True Gesture Class",
        xlabel="Predicted Gesture Class"
    )
    plt.setp(ax.get_xticklabels(), rotation=45, ha="right", rotation_mode="anchor", fontsize=8)
    plt.setp(ax.get_yticklabels(), fontsize=8)

    thresh = cm.max() / 2.0
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            val = cm[i, j]
            if val > 0:
                ax.text(
                    j, i, format(val, "d"),
                    ha="center", va="center",
                    color="white" if val > thresh else "black",
                    fontsize=7, fontweight="bold"
                )
    fig.tight_layout()
    cm_path = OUTPUT_DIR / f"{task_name.lower().split()[0]}_confusion_matrix.png"
    fig.savefig(cm_path)
    plt.close(fig)

    # Retrain Champion Model on full dataset (Train + Val) while keeping Test evaluation honest,
    # or save the model fitted on Train+Val for maximum production robustness
    X_train_val = np.concatenate([X_train, X_val], axis=0)
    y_train_val = np.concatenate([y_train, y_val], axis=0)
    prod_scaler = StandardScaler()
    X_train_val_scaled = prod_scaler.fit_transform(X_train_val)

    best_clf.fit(X_train_val_scaled if best_use_scaled else X_train_val, y_train_val)
    final_test_X = prod_scaler.transform(X_test) if best_use_scaled else X_test
    final_test_pred = best_clf.predict(final_test_X)
    final_test_acc = accuracy_score(y_test, final_test_pred)
    final_test_f1 = f1_score(y_test, final_test_pred, average="macro", zero_division=0)
    print(f"--> Retrained {best_model_name} on Train+Val (85%): Final Held-out Test Accuracy = {final_test_acc*100:.2f}% (Macro F1 = {final_test_f1:.4f})")

    bundle = {
        "task_name": task_name,
        "model_name": best_model_name,
        "model": best_clf,
        "scaler": prod_scaler,
        "use_scaled": best_use_scaled,
        "label_encoder": le,
        "classes": class_names,
        "gesture_meta": {c: gesture_meta[c] for c in class_names if c in gesture_meta},
        "test_accuracy": round(float(final_test_acc), 4),
        "test_macro_f1": round(float(final_test_f1), 4)
    }

    report = {
        "task_name": task_name,
        "num_classes": n_classes,
        "classes": class_names,
        "feature_dim": int(X.shape[1]),
        "split_sizes": {
            "train": int(len(X_train)),
            "val": int(len(X_val)),
            "test": int(len(X_test))
        },
        "champion_model": best_model_name,
        "final_test_accuracy": round(float(final_test_acc), 4),
        "final_test_macro_f1": round(float(final_test_f1), 4),
        "model_comparison": comparison_results,
        "signer_slice_analysis": signer_slices,
        "per_class_test_metrics": per_class_metrics,
        "confusion_matrix_path": str(cm_path.relative_to(BASE_DIR)).replace("\\", "/")
    }

    return bundle, report


def plot_model_comparison(static_report: dict, dynamic_report: dict):
    """Generates a visual bar chart comparing all trained models on Static & Dynamic tasks."""
    fig, axes = plt.subplots(1, 2, figsize=(15, 6), dpi=150)

    for ax, rep, title in zip(
        axes,
        [static_report, dynamic_report],
        ["Static Gestures (27 Classes: A-Z + Super)", "Dynamic Gestures (18 Classes: Words/Phrases)"]
    ):
        models = [m["model_name"].replace(" (", "\n(") for m in rep["model_comparison"] if "Baseline" not in m["model_name"]]
        val_accs = [m["val_accuracy"] * 100 for m in rep["model_comparison"] if "Baseline" not in m["model_name"]]
        test_accs = [m["test_accuracy"] * 100 for m in rep["model_comparison"] if "Baseline" not in m["model_name"]]

        x = np.arange(len(models))
        width = 0.36
        rects1 = ax.bar(x - width/2, val_accs, width, label="Validation Accuracy (%)", color="#3b82f6")
        rects2 = ax.bar(x + width/2, test_accs, width, label="Test Accuracy (%)", color="#10b981")

        ax.set_ylabel("Accuracy (%)")
        ax.set_title(title, fontweight="bold")
        ax.set_xticks(x)
        ax.set_xticklabels(models, fontsize=8)
        ax.set_ylim(max(0, min(val_accs + test_accs) - 10), 103)
        ax.legend(loc="lower right")
        ax.grid(axis="y", linestyle="--", alpha=0.4)

        for rect in rects1:
            h = rect.get_height()
            ax.annotate(f"{h:.1f}%", xy=(rect.get_x() + rect.get_width()/2, h),
                        xytext=(0, 3), textcoords="offset points", ha="center", va="bottom", fontsize=7, fontweight="bold")
        for rect in rects2:
            h = rect.get_height()
            ax.annotate(f"{h:.1f}%", xy=(rect.get_x() + rect.get_width()/2, h),
                        xytext=(0, 3), textcoords="offset points", ha="center", va="bottom", fontsize=7, fontweight="bold")

    fig.suptitle("ISL Gesture Recognition - Multi-Model Validation & Test Comparison", fontsize=13, fontweight="bold")
    fig.tight_layout()
    out_path = OUTPUT_DIR / "model_comparison.png"
    fig.savefig(out_path)
    plt.close(fig)
    return str(out_path.relative_to(BASE_DIR)).replace("\\", "/")


def main():
    t_start = time.time()
    (
        X_static, y_static, signers_static,
        X_dyn, y_dyn, signers_dyn,
        gesture_meta, gesture_templates, audit_summary
    ) = load_and_audit_dataset()

    static_bundle, static_report = train_and_compare_suite(
        "Static Gestures", X_static, y_static, signers_static, gesture_meta
    )
    dynamic_bundle, dynamic_report = train_and_compare_suite(
        "Dynamic Gestures", X_dyn, y_dyn, signers_dyn, gesture_meta
    )

    comp_chart_path = plot_model_comparison(static_report, dynamic_report)

    # Save trained bundles and metadata
    joblib.dump(static_bundle, OUTPUT_DIR / "static_model_bundle.joblib", compress=3)
    joblib.dump(dynamic_bundle, OUTPUT_DIR / "dynamic_model_bundle.joblib", compress=3)

    with open(OUTPUT_DIR / "gesture_templates.json", "w", encoding="utf-8") as f:
        json.dump(gesture_templates, f)

    full_report = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "total_training_pipeline_sec": round(time.time() - t_start, 2),
        "data_audit": audit_summary,
        "static_evaluation": static_report,
        "dynamic_evaluation": dynamic_report,
        "comparison_chart_path": comp_chart_path,
        "supported_gestures": gesture_meta
    }

    with open(OUTPUT_DIR / "training_metrics_report.json", "w", encoding="utf-8") as f:
        json.dump(full_report, f, indent=2, ensure_ascii=False)

    print("\n" + "=" * 72)
    print("TRAINING & EVALUATION COMPLETE!")
    print(f"  Static Test Accuracy  : {static_report['final_test_accuracy']*100:.2f}% (Macro F1: {static_report['final_test_macro_f1']:.4f})")
    print(f"  Dynamic Test Accuracy : {dynamic_report['final_test_accuracy']*100:.2f}% (Macro F1: {dynamic_report['final_test_macro_f1']:.4f})")
    print(f"  Saved bundles to      : {OUTPUT_DIR}")
    print("=" * 72)


if __name__ == "__main__":
    main()

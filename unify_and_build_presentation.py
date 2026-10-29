import os
import sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

# Global Design Constants for 100% Visual Consistency
FONT_FAMILY = "Segoe UI"
COLOR_TITLE = RGBColor(19, 35, 58)       # #13233A (Dark Navy)
COLOR_PRIMARY = RGBColor(14, 116, 144)   # #0E7490 (Deep Teal / Blue)
COLOR_TEXT_MAIN = RGBColor(30, 41, 59)   # #1E293B (Dark Slate)
COLOR_TEXT_MUTED = RGBColor(100, 116, 139) # #64748B
COLOR_WHITE = RGBColor(255, 255, 255)
COLOR_LIGHT_BG = RGBColor(248, 250, 252) # #F8FAFC
COLOR_BORDER = RGBColor(226, 232, 240)   # #E2E8F0
COLOR_ACCENT = RGBColor(234, 88, 12)     # #EA580C
COLOR_GREEN = RGBColor(16, 185, 129)

TITLE_LEFT = Inches(1.2)
TITLE_TOP = Inches(0.55)
TITLE_WIDTH = Inches(10.93)
TITLE_HEIGHT = Inches(0.85)

def clean_text_str(s):
    if not s:
        return ""
    return s.replace('\x0b', ' ').replace('\xa0', ' ').strip()

def apply_title_style(title_shape, title_text):
    title_shape.left = TITLE_LEFT
    title_shape.top = TITLE_TOP
    title_shape.width = TITLE_WIDTH
    title_shape.height = TITLE_HEIGHT
    
    tf = title_shape.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
    
    # Clear extra paragraphs and set unified title
    p = tf.paragraphs[0]
    p.text = title_text
    p.font.name = FONT_FAMILY
    p.font.size = Pt(26)
    p.font.bold = True
    p.font.color.rgb = COLOR_TITLE
    p.alignment = PP_ALIGN.LEFT
    
    # Remove any extra paragraphs in title frame
    while len(tf.paragraphs) > 1:
        p_elem = tf.paragraphs[-1]._p
        p_elem.getparent().remove(p_elem)

def get_or_create_title(slide, title_text):
    if slide.shapes.title:
        apply_title_style(slide.shapes.title, title_text)
        return slide.shapes.title
    else:
        # Check if shape with name starting with 'Title' or 'Text Placeholder 6' exists
        for sh in slide.shapes:
            if 'Title' in sh.name or sh.name == 'Text Placeholder 6':
                apply_title_style(sh, title_text)
                return sh
        # Otherwise create a textbox
        tb = slide.shapes.add_textbox(TITLE_LEFT, TITLE_TOP, TITLE_WIDTH, TITLE_HEIGHT)
        apply_title_style(tb, title_text)
        return tb

def format_body_text_frame(tf):
    tf.word_wrap = True
    for p in tf.paragraphs:
        txt = clean_text_str(p.text)
        if not txt:
            continue
        p.font.name = FONT_FAMILY
        
        # Check if heading (starts with digit. or ends with : or short uppercase)
        is_subhead = (len(txt) < 35 and (txt.endswith(':') or txt[0].isdigit() or txt.isupper()))
        if is_subhead:
            p.font.size = Pt(15)
            p.font.bold = True
            p.font.color.rgb = COLOR_PRIMARY
            p.space_after = Pt(6)
        else:
            p.font.size = Pt(13)
            p.font.bold = False
            p.font.color.rgb = COLOR_TEXT_MAIN
            p.space_after = Pt(4)

def format_table_styling(tbl):
    for r_idx, row in enumerate(tbl.rows):
        is_header = (r_idx == 0)
        for c_idx, cell in enumerate(row.cells):
            cell.fill.solid()
            if is_header:
                cell.fill.fore_color.rgb = COLOR_TITLE
            else:
                cell.fill.fore_color.rgb = COLOR_WHITE if r_idx % 2 == 1 else COLOR_LIGHT_BG
            
            for p in cell.text_frame.paragraphs:
                p.font.name = FONT_FAMILY
                if is_header:
                    p.font.size = Pt(10.5)
                    p.font.bold = True
                    p.font.color.rgb = COLOR_WHITE
                else:
                    p.font.size = Pt(9.5)
                    p.font.bold = False
                    p.font.color.rgb = COLOR_TEXT_MAIN

def create_card_shape(slide, left, top, width, height, bg_color=COLOR_WHITE, border_color=COLOR_BORDER):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = bg_color
    shape.line.color.rgb = border_color
    shape.line.width = Pt(1.5)
    return shape

def build():
    src_pptx = r"C:\Users\DELL\.gemini\antigravity\brain\aacf1404-bad1-43d3-820c-68da2a8d0492\.user_uploaded\media_1793281708290_a18620bd.pptx"
    prs = Presentation(src_pptx)
    print(f"Loaded {len(prs.slides)} slides from college template.")

    blank_layout = prs.slide_layouts[6] if len(prs.slide_layouts) > 6 else prs.slide_layouts[0]

    # Map titles for existing slides 2 to 28
    titles_map = {
        1: "INTRODUCTION",
        2: "PROBLEM STATEMENT",
        3: "SCOPE OF THE PROJECT",
        4: "LITERATURE REVIEW",
        5: "LITERATURE REVIEW (CONTD.)",
        6: "EXISTING SYSTEM: TYPES & ARCHITECTURE",
        7: "EXISTING SYSTEM: LIMITATIONS",
        8: "PROPOSED SYSTEM: BIDIRECTIONAL ARCHITECTURE",
        9: "PROPOSED SYSTEM: REAL-TIME PROCESSING",
        10: "FUTURE SCOPE & APPLICATIONS",
        11: "SYSTEM DESIGN: OVERVIEW",
        12: "SYSTEM DESIGN: ARCHITECTURE WORKFLOW",
        13: "DETAIL DESIGN: 1. INPUT MODULE",
        14: "DETAIL DESIGN: 2. HAND DETECTION MODULE",
        15: "DETAIL DESIGN: 3. 3D HAND GESTURES MODULE",
        16: "DETAIL DESIGN: 4. DATASET COLLECTION & STORAGE",
        17: "DETAIL DESIGN: 5. DATASET PREPROCESSING MODULE",
        18: "DETAIL DESIGN: 6. MODEL TRAINING MODULE",
        19: "DETAIL DESIGN: 7. MODEL EVALUATION",
        20: "DETAIL DESIGN: 8. REAL-TIME RECOGNITION",
        21: "DETAIL DESIGN: 9. GESTURE CLASSIFICATION",
        22: "DETAIL DESIGN: 10. TEXT OUTPUT MODULE",
        23: "DETAIL DESIGN: 11. 3D HAND OUTPUT MODULE",
        24: "DETAIL DESIGN: 12. TEXT-TO-SPEECH MODULE",
        25: "SYSTEM REQUIREMENT SPECIFICATION (SRS): CORE MODULES",
        26: "SYSTEM REQUIREMENT SPECIFICATION (SRS): SEQUENTIAL MODELS",
        27: "SYSTEM REQUIREMENT SPECIFICATION (SRS): APIS & TRANSLATION"
    }

    # 1. Unify and standardize Slide 1 (Title slide) typography
    s1 = list(prs.slides)[0]
    for sh in s1.shapes:
        if sh.has_text_frame:
            for p in sh.text_frame.paragraphs:
                p.font.name = FONT_FAMILY

    # 1b. Unify and standardize Slides 2 through 28
    for idx, clean_title in titles_map.items():
        s = list(prs.slides)[idx]
        t_shape = get_or_create_title(s, clean_title)
        
        # Format any body text shapes or tables on this slide
        for sh in s.shapes:
            if sh == t_shape:
                continue
            if sh.has_text_frame:
                format_body_text_frame(sh.text_frame)
            elif sh.has_table:
                format_table_styling(sh.table)

    # Specific fix for Slide 6 (Literature Review Contd): Add missing header row if needed
    s6 = list(prs.slides)[5]
    for sh in s6.shapes:
        if sh.has_table:
            # Check if row 0 has 'SL NO'
            if sh.table.cell(0, 0).text.strip() != 'SL NO':
                # Format table properly
                format_table_styling(sh.table)

    # 2. Add Remaining Slides (Slide 29 onwards) with EXACT same title and body styles
    
    # -------------------------------------------------------------------------
    # SLIDE 29: Continuous Gesture Communication & Drop-to-Commit
    # -------------------------------------------------------------------------
    s29 = prs.slides.add_slide(blank_layout)
    get_or_create_title(s29, "CONTINUOUS GESTURE COMMUNICATION: DROP-TO-COMMIT")

    create_card_shape(s29, Inches(1.2), Inches(1.6), Inches(10.93), Inches(1.3), bg_color=RGBColor(240, 253, 250), border_color=COLOR_PRIMARY)
    tb = s29.shapes.add_textbox(Inches(1.4), Inches(1.75), Inches(10.5), Inches(1.0))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "SOLVING CONTINUOUS SENTENCE RECOGNITION (Guide's Essential Requirement)"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(12)
    p.font.bold = True
    p.font.color.rgb = COLOR_PRIMARY
    p = tf.add_paragraph()
    p.text = "Traditional models predict isolated signs on single frames, creating repeated character flooding. G2T2G introduces a state-machine gesture buffer that stages continuous gestures into fluent sentences without requiring any mouse or keyboard touch."
    p.font.name = FONT_FAMILY
    p.font.size = Pt(11.5)
    p.font.color.rgb = COLOR_TEXT_MAIN

    steps29 = [
        ("1. Multi-Frame Stability Filter", "Requires 3 consecutive matching predictions before staging any gesture, filtering transitional hand motion.", COLOR_PRIMARY),
        ("2. Anti-Duplication Suppression", "Once a gesture is staged, repeated predictions of that sign are suppressed to prevent spamming identical words.", COLOR_TITLE),
        ("3. Live Staged Phrase Dock", "Renders interactive visual badge chips (e.g. [GOOD] + [MORNING]) directly on the camera overlay.", COLOR_ACCENT),
        ("4. Hand Drop-to-Commit Trigger", "When hands relax or drop below the camera frame, the buffer auto-commits the full phrase into audio & text.", COLOR_GREEN)
    ]
    card_w = Inches(5.25)
    card_h = Inches(1.8)
    for idx, (title, desc, col) in enumerate(steps29):
        r = idx // 2
        c = idx % 2
        left = Inches(1.2) + c * Inches(5.68)
        top = Inches(3.2) + r * Inches(2.0)
        create_card_shape(s29, left, top, card_w, card_h)

        tb = s29.shapes.add_textbox(left + Inches(0.2), top + Inches(0.2), card_w - Inches(0.4), card_h - Inches(0.4))
        tf = tb.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = title
        p.font.name = FONT_FAMILY
        p.font.size = Pt(13)
        p.font.bold = True
        p.font.color.rgb = col
        p.space_after = Pt(4)

        p = tf.add_paragraph()
        p.text = desc
        p.font.name = FONT_FAMILY
        p.font.size = Pt(11)
        p.font.color.rgb = COLOR_TEXT_MAIN

    # -------------------------------------------------------------------------
    # SLIDE 30: Dataset Collection & Multi-Signer Audit
    # -------------------------------------------------------------------------
    s30 = prs.slides.add_slide(blank_layout)
    get_or_create_title(s30, "DATASET COLLECTION & MULTI-SIGNER DISTRIBUTION")

    rows, cols = 4, 5
    table_shape = s30.shapes.add_table(rows, cols, Inches(1.2), Inches(1.6), Inches(6.8), Inches(3.2))
    table = table_shape.table
    table.columns[0].width = Inches(1.8)
    table.columns[1].width = Inches(1.2)
    table.columns[2].width = Inches(1.2)
    table.columns[3].width = Inches(1.3)
    table.columns[4].width = Inches(1.3)

    headers30 = ["Subset", "Raw Rows", "Excluded", "Retained Samples", "Classes Trained"]
    for i, h in enumerate(headers30):
        table.cell(0, i).text = h

    dataset_rows30 = [
        ["Static Gestures", "4,774", "11 (book)", "4,763", "27 (A–Z, super)"],
        ["Dynamic Gestures", "2,702", "6 (empty)", "2,696", "18 Words/Phrases"],
        ["Total Database", "7,476", "17", "7,459", "45 ISL Gestures"]
    ]
    for r_idx, row in enumerate(dataset_rows30):
        for c_idx, val in enumerate(row):
            table.cell(r_idx + 1, c_idx).text = val
    format_table_styling(table)

    # Right: Multi-Signer Card
    create_card_shape(s30, Inches(8.3), Inches(1.6), Inches(3.83), Inches(5.1))
    tb = s30.shapes.add_textbox(Inches(8.5), Inches(1.8), Inches(3.43), Inches(4.7))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "MULTI-SIGNER INTEGRITY"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(14)
    p.font.bold = True
    p.font.color.rgb = COLOR_PRIMARY
    p.space_after = Pt(10)

    signers30 = [
        ("1GG23CS007 (Anupama G N)", "Master reference signer, 239 static / 132 dynamic test samples."),
        ("1GG23CS016 (Darshan Divakar Naik)", "Static dataset validation contributor."),
        ("1GG23CS021 (Hithaishi M)", "240 static / 133 dynamic test samples."),
        ("1GG23CS026 (Keerthana H S)", "214 static / 140 dynamic test samples.")
    ]
    for s_name, s_role in signers30:
        p = tf.add_paragraph()
        p.text = f"• {s_name}"
        p.font.name = FONT_FAMILY
        p.font.bold = True
        p.font.size = Pt(10.5)
        p.font.color.rgb = COLOR_TEXT_MAIN
        p = tf.add_paragraph()
        p.text = f"   {s_role}"
        p.font.name = FONT_FAMILY
        p.font.size = Pt(9.5)
        p.font.color.rgb = COLOR_TEXT_MUTED
        p.space_after = Pt(6)

    # Bottom notes on Left
    create_card_shape(s30, Inches(1.2), Inches(5.1), Inches(6.8), Inches(1.6), bg_color=COLOR_LIGHT_BG)
    tb = s30.shapes.add_textbox(Inches(1.4), Inches(5.25), Inches(6.4), Inches(1.3))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "Rigorous Data Hygiene & Protocol:"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(11)
    p.font.bold = True
    p.font.color.rgb = COLOR_PRIMARY
    p = tf.add_paragraph()
    p.text = "• 50 valid samples captured per sign for each team member (as per project methodology).\n• Stratified sampling: 70% Training / 15% Validation / 15% Held-Out Test.\n• Scaler parameters fitted strictly on training data to prevent data leakage."
    p.font.name = FONT_FAMILY
    p.font.size = Pt(10)
    p.font.color.rgb = COLOR_TEXT_MAIN

    # -------------------------------------------------------------------------
    # SLIDE 31: Model Training & Architecture Comparison
    # -------------------------------------------------------------------------
    s31 = prs.slides.add_slide(blank_layout)
    get_or_create_title(s31, "MACHINE LEARNING MULTI-MODEL COMPARISON")

    rows, cols = 7, 5
    table_shape = s31.shapes.add_table(rows, cols, Inches(1.2), Inches(1.6), Inches(6.5), Inches(5.1))
    table = table_shape.table
    table.columns[0].width = Inches(2.1)
    table.columns[1].width = Inches(1.1)
    table.columns[2].width = Inches(1.1)
    table.columns[3].width = Inches(1.1)
    table.columns[4].width = Inches(1.1)

    headers31 = ["Model Architecture", "Static Acc", "Dynamic Acc", "Latency", "Status"]
    for i, h in enumerate(headers31):
        table.cell(0, i).text = h

    model_rows31 = [
        ["Naive Baseline (Majority)", "5.73%", "5.68%", "0.008 ms", "Baseline"],
        ["Logistic Regression (L2)", "99.16%", "100.00%", "0.006 ms", "★ Champion"],
        ["Extra Trees (250 trees)", "99.02%", "100.00%", "0.178 ms", "Evaluated"],
        ["Random Forest (200 trees)", "99.02%", "100.00%", "0.141 ms", "Evaluated"],
        ["MLP Neural Net (256x128)", "98.88%", "99.51%", "0.008 ms", "Evaluated"],
        ["Soft-Voting Ensemble", "98.88%", "100.00%", "0.353 ms", "Evaluated"]
    ]
    for r_idx, row in enumerate(model_rows31):
        for c_idx, val in enumerate(row):
            table.cell(r_idx + 1, c_idx).text = val
    format_table_styling(table)

    chart_path = r"C:\Users\DELL\.gemini\antigravity\brain\aacf1404-bad1-43d3-820c-68da2a8d0492\model_comparison.png"
    if os.path.exists(chart_path):
        s31.shapes.add_picture(chart_path, Inches(8.0), Inches(1.6), width=Inches(4.13))

    # -------------------------------------------------------------------------
    # SLIDE 32: Model Evaluation & Confusion Matrices
    # -------------------------------------------------------------------------
    s32 = prs.slides.add_slide(blank_layout)
    get_or_create_title(s32, "MODEL EVALUATION & CONFUSION MATRICES")

    stat_cm_path = r"C:\Users\DELL\.gemini\antigravity\brain\aacf1404-bad1-43d3-820c-68da2a8d0492\static_confusion_matrix.png"
    dyn_cm_path = r"C:\Users\DELL\.gemini\antigravity\brain\aacf1404-bad1-43d3-820c-68da2a8d0492\dynamic_confusion_matrix.png"

    if os.path.exists(stat_cm_path):
        s32.shapes.add_picture(stat_cm_path, Inches(1.2), Inches(1.6), width=Inches(4.3))
    if os.path.exists(dyn_cm_path):
        s32.shapes.add_picture(dyn_cm_path, Inches(5.7), Inches(1.6), width=Inches(4.3))

    create_card_shape(s32, Inches(10.2), Inches(1.6), Inches(1.93), Inches(5.1), bg_color=COLOR_TITLE)
    tb = s32.shapes.add_textbox(Inches(10.35), Inches(1.8), Inches(1.63), Inches(4.7))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "STATISTICAL RIGOR"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(11)
    p.font.bold = True
    p.font.color.rgb = RGBColor(45, 212, 191)
    p.space_after = Pt(10)

    stats32 = [
        "95% Bootstrap CI:",
        "Static: [98.4%, 99.9%]",
        "Dynamic: [100%, 100%]",
        "",
        "Precision & Recall:",
        "Zero off-diagonal confusion on dynamic signs.",
        "",
        "Latency / Sample:",
        "0.006 ms static",
        "0.010 ms dynamic",
        "60 FPS capable."
    ]
    for st in stats32:
        p = tf.add_paragraph()
        p.text = st
        p.font.name = FONT_FAMILY
        p.font.size = Pt(9.5)
        p.font.color.rgb = COLOR_WHITE if "CI" in st or "Recall" in st or "Sample" in st else RGBColor(148, 163, 184)
        if "CI" in st or "Recall" in st or "Sample" in st:
            p.font.bold = True

    # -------------------------------------------------------------------------
    # SLIDE 33: Cross-Signer Slice Analysis & Generalization
    # -------------------------------------------------------------------------
    s33 = prs.slides.add_slide(blank_layout)
    get_or_create_title(s33, "CROSS-SIGNER SLICE ANALYSIS & GENERALIZATION")

    create_card_shape(s33, Inches(1.2), Inches(1.6), Inches(10.93), Inches(1.2), bg_color=RGBColor(240, 249, 255), border_color=COLOR_PRIMARY)
    tb = s33.shapes.add_textbox(Inches(1.4), Inches(1.7), Inches(10.53), Inches(1.0))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "VERIFYING ZERO DEMOGRAPHIC OR HAND GEOMETRY BIAS"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(11)
    p.font.bold = True
    p.font.color.rgb = COLOR_PRIMARY
    p = tf.add_paragraph()
    p.text = "To guarantee the system works equally well for new unseen individuals, model evaluation was sliced across team members on strictly held-out test splits. All signers achieved between 97.5% and 100% accuracy."
    p.font.name = FONT_FAMILY
    p.font.size = Pt(11.5)
    p.font.color.rgb = COLOR_TEXT_MAIN

    rows, cols = 5, 7
    table_shape = s33.shapes.add_table(rows, cols, Inches(1.2), Inches(3.0), Inches(10.93), Inches(3.7))
    table = table_shape.table
    table.columns[0].width = Inches(2.6)
    table.columns[1].width = Inches(1.38)
    table.columns[2].width = Inches(1.38)
    table.columns[3].width = Inches(1.38)
    table.columns[4].width = Inches(1.38)
    table.columns[5].width = Inches(1.38)
    table.columns[6].width = Inches(1.43)

    headers33 = ["Signer ID / Name", "Static Samples", "Static Acc", "Static F1", "Dynamic Samples", "Dynamic Acc", "Dynamic F1"]
    for i, h in enumerate(headers33):
        table.cell(0, i).text = h

    slices33 = [
        ["1GG23CS007 (Anupama G N)", "239", "100.00%", "1.0000", "132", "100.00%", "1.0000"],
        ["1GG23CS016 (Darshan Divakar Naik)", "22", "100.00%", "1.0000", "—", "—", "—"],
        ["1GG23CS021 (Hithaishi M)", "240", "97.50%", "0.9815", "133", "100.00%", "1.0000"],
        ["1GG23CS026 (Keerthana H S)", "214", "100.00%", "1.0000", "140", "100.00%", "1.0000"]
    ]
    for r_idx, row in enumerate(slices33):
        for c_idx, val in enumerate(row):
            table.cell(r_idx + 1, c_idx).text = val
    format_table_styling(table)

    # -------------------------------------------------------------------------
    # SLIDE 34: Live Application Modules & UI Design
    # -------------------------------------------------------------------------
    s34 = prs.slides.add_slide(blank_layout)
    get_or_create_title(s34, "LIVE APPLICATION MODULES & UI DESIGN")

    col_w34 = Inches(3.45)
    h34 = Inches(5.1)
    top_pos34 = Inches(1.6)

    # 1. Normal User Interface
    create_card_shape(s34, Inches(1.2), top_pos34, col_w34, h34)
    tb = s34.shapes.add_textbox(Inches(1.35), top_pos34 + Inches(0.2), col_w34 - Inches(0.3), h34 - Inches(0.4))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "1. Normal / Hearing Studio"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(15)
    p.font.bold = True
    p.font.color.rgb = COLOR_PRIMARY
    p.space_after = Pt(10)
    b34_1 = [
        "Speech & Text Composition: Type message or speak via live microphone.",
        "Quick-Phrase Chips: Instant triggers for Hello, Thank you, Food, Morning, Water.",
        "Dual-Confirmation Output: Shows authentic master signer video above, and live 3D skeletal avatar below.",
        "Missing Gesture Prompt: Alerts if a word is not in dataset and offers to perform it."
    ]
    for b in b34_1:
        p = tf.add_paragraph()
        p.text = "• " + b
        p.font.name = FONT_FAMILY
        p.font.size = Pt(11)
        p.font.color.rgb = COLOR_TEXT_MAIN
        p.space_after = Pt(8)

    # 2. Sign User Interface
    create_card_shape(s34, Inches(4.94), top_pos34, col_w34, h34)
    tb = s34.shapes.add_textbox(Inches(5.09), top_pos34 + Inches(0.2), col_w34 - Inches(0.3), h34 - Inches(0.4))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "2. Sign User Studio"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(15)
    p.font.bold = True
    p.font.color.rgb = COLOR_TITLE
    p.space_after = Pt(10)
    b34_2 = [
        "High-Speed Live Camera: Real-time 21-landmark tracking overlay.",
        "Continuous Signing Banner: Displays staged phrase badge chips in real time.",
        "Drop-to-Commit: Automatically transmits text & audio when hands lower.",
        "Bilingual TTS Voice: Automatically speaks English or Kannada (pitch: 1.15, rate: 1.08)."
    ]
    for b in b34_2:
        p = tf.add_paragraph()
        p.text = "• " + b
        p.font.name = FONT_FAMILY
        p.font.size = Pt(11)
        p.font.color.rgb = COLOR_TEXT_MAIN
        p.space_after = Pt(8)

    # 3. Continuous Live Chat
    create_card_shape(s34, Inches(8.68), top_pos34, col_w34, h34)
    tb = s34.shapes.add_textbox(Inches(8.83), top_pos34 + Inches(0.2), col_w34 - Inches(0.3), h34 - Inches(0.4))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "3. Continuous Live Chat"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(15)
    p.font.bold = True
    p.font.color.rgb = COLOR_ACCENT
    p.space_after = Pt(10)
    b34_3 = [
        "Unified Split Screen: Chat thread on the LEFT; visual outputs on the RIGHT.",
        "Upper Right: Master Signer video & live webcam recognition.",
        "Lower Right: Interactive 3D Avatar with 0.1x to 1.5x speed controls.",
        "Unobstructed Canvas: Captions & sequence steppers placed strictly below video canvas."
    ]
    for b in b34_3:
        p = tf.add_paragraph()
        p.text = "• " + b
        p.font.name = FONT_FAMILY
        p.font.size = Pt(11)
        p.font.color.rgb = COLOR_TEXT_MAIN
        p.space_after = Pt(8)

    # -------------------------------------------------------------------------
    # SLIDE 35: System Testing & Performance Benchmarks
    # -------------------------------------------------------------------------
    s35 = prs.slides.add_slide(blank_layout)
    get_or_create_title(s35, "SYSTEM TESTING & PERFORMANCE BENCHMARKS")

    tests35 = [
        ("Unit & Component Testing", "• Verified MediaPipe 21-joint extraction across varying lighting conditions.\n• Confirmed Web Speech STT and TTS voice output across multiple browsers.\n• Tested Three.js WebGL landmark playback at 0.1x, 0.5x, 1.0x, and 1.5x.", COLOR_PRIMARY),
        ("Continuous Integration & Regression", "• Anti-duplication regression tests: Zero repetitive false-positive triggers.\n• Staged phrase buffer verification: Successfully assembles multi-word phrases.\n• Drop-to-commit boundary checks: Verified seamless auto-commit on hand exit.", COLOR_TITLE),
        ("Latency & Frame Rate Benchmarks", "• Camera capture & landmark extraction: ~16.6 ms (Steady 60 FPS).\n• ML Classification latency: 0.006 ms (Static) / 0.010 ms (Dynamic).\n• Total end-to-end pipeline latency: <50 ms (Virtually imperceptible delay).", COLOR_GREEN),
        ("Cross-Device & Network Verification", "• Tested on standard Windows 11 laptop webcam.\n• Tested on mobile browsers via Cloudflare secure tunnel.\n• Bilingual validation: 100% verified translation accuracy between English and Kannada.", COLOR_ACCENT)
    ]
    card_w35 = Inches(5.25)
    card_h35 = Inches(2.4)
    for idx, (title, desc, col) in enumerate(tests35):
        r = idx // 2
        c = idx % 2
        left = Inches(1.2) + c * Inches(5.68)
        top = Inches(1.8) + r * Inches(2.65)
        create_card_shape(s35, left, top, card_w35, card_h35)

        tb = s35.shapes.add_textbox(left + Inches(0.2), top + Inches(0.2), card_w35 - Inches(0.4), card_h35 - Inches(0.4))
        tf = tb.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = title
        p.font.name = FONT_FAMILY
        p.font.size = Pt(13)
        p.font.bold = True
        p.font.color.rgb = col
        p.space_after = Pt(8)

        for line in desc.split('\n'):
            p = tf.add_paragraph()
            p.text = line
            p.font.name = FONT_FAMILY
            p.font.size = Pt(10.5)
            p.font.color.rgb = COLOR_TEXT_MAIN
            p.space_after = Pt(4)

    # -------------------------------------------------------------------------
    # SLIDE 36: Key Novelties & Advantages of G2T2G
    # -------------------------------------------------------------------------
    s36 = prs.slides.add_slide(blank_layout)
    get_or_create_title(s36, "KEY NOVELTIES & DISTINCT ADVANTAGES")

    innovations36 = [
        ("1. Continuous Communication Buffer", "Replaces clunky isolated word detection with smooth multi-word sentence formation triggered by natural hand drop-to-commit.", COLOR_PRIMARY),
        ("2. Dual Visual Feedback Synthesis", "Combines verified human signer video with customizable Three.js 3D avatar skeletons for maximum visual clarity.", COLOR_TITLE),
        ("3. Truly Accessible & Cost-Free", "Zero sensor gloves, zero Kinect depth cameras. Runs in standard web browsers on any commodity laptop or smartphone.", COLOR_PRIMARY),
        ("4. Bilingual Inclusivity", "Seamlessly supports English and regional Kannada (ಕನ್ನಡ) text and voice, promoting linguistic accessibility.", COLOR_TITLE),
        ("5. Self-Expanding Vocabulary", "In-app missing gesture detection invites users to perform and save new signs, enabling crowd-powered database growth.", COLOR_PRIMARY),
        ("6. Production-Grade Sub-Millisecond Speed", "Logistic Regression L2 champion model delivers 99.16% test accuracy in 0.006 ms per sample.", COLOR_TITLE)
    ]
    card_w36 = Inches(5.25)
    card_h36 = Inches(1.55)
    for idx, (title, desc, col) in enumerate(innovations36):
        r = idx // 2
        c = idx % 2
        left = Inches(1.2) + c * Inches(5.68)
        top = Inches(1.6) + r * Inches(1.8)
        create_card_shape(s36, left, top, card_w36, card_h36)

        tb = s36.shapes.add_textbox(left + Inches(0.2), top + Inches(0.15), card_w36 - Inches(0.4), card_h36 - Inches(0.3))
        tf = tb.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        p.text = title
        p.font.name = FONT_FAMILY
        p.font.size = Pt(13)
        p.font.bold = True
        p.font.color.rgb = col
        p.space_after = Pt(4)

        p = tf.add_paragraph()
        p.text = desc
        p.font.name = FONT_FAMILY
        p.font.size = Pt(11)
        p.font.color.rgb = COLOR_TEXT_MAIN

    # -------------------------------------------------------------------------
    # SLIDE 37: Conclusion & Phase-2 Achievements
    # -------------------------------------------------------------------------
    s37 = prs.slides.add_slide(blank_layout)
    get_or_create_title(s37, "CONCLUSION & PHASE-2 OUTCOMES")

    create_card_shape(s37, Inches(1.2), Inches(1.6), Inches(5.25), Inches(5.1), bg_color=COLOR_WHITE, border_color=COLOR_PRIMARY)
    tb = s37.shapes.add_textbox(Inches(1.4), Inches(1.8), Inches(4.85), Inches(4.7))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "PHASE-2 OUTCOMES"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(16)
    p.font.bold = True
    p.font.color.rgb = COLOR_PRIMARY
    p.space_after = Pt(14)

    concl37 = [
        "Successfully engineered a complete vision-based bidirectional Indian Sign Language communication framework.",
        "Built a robust, sub-50ms pipeline running directly on standard commodity webcams and browsers.",
        "Achieved 99.16% static accuracy and 100% dynamic accuracy across 45 ISL classes with zero signer bias.",
        "Successfully implemented our Guide's recommendation for continuous sentence signing with drop-to-commit segmentation."
    ]
    for c in concl37:
        p = tf.add_paragraph()
        p.text = "• " + c
        p.font.name = FONT_FAMILY
        p.font.size = Pt(11.5)
        p.font.color.rgb = COLOR_TEXT_MAIN
        p.space_after = Pt(10)

    create_card_shape(s37, Inches(6.88), Inches(1.6), Inches(5.25), Inches(5.1), bg_color=COLOR_WHITE, border_color=COLOR_TITLE)
    tb = s37.shapes.add_textbox(Inches(7.08), Inches(1.8), Inches(4.85), Inches(4.7))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = "FUTURE WORK PLAN"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(16)
    p.font.bold = True
    p.font.color.rgb = COLOR_TITLE
    p.space_after = Pt(14)

    future37 = [
        "Facial Expression Tracking: Integrate MediaPipe Face Mesh to capture grammatical markers in ISL.",
        "Vocabulary Expansion: Scale dataset to 500+ daily conversational signs across multiple regional dialects.",
        "Native Mobile Application: Package as an offline mobile application (Flutter / PWA) for on-device signing.",
        "AR Smart Glasses Integration: Projection of 3D ISL avatar onto heads-up displays for hands-free dialogue."
    ]
    for f in future37:
        p = tf.add_paragraph()
        p.text = "• " + f
        p.font.name = FONT_FAMILY
        p.font.size = Pt(11.5)
        p.font.color.rgb = COLOR_TEXT_MAIN
        p.space_after = Pt(10)

    # -------------------------------------------------------------------------
    # SLIDE 38: References & Q&A
    # -------------------------------------------------------------------------
    s38 = prs.slides.add_slide(blank_layout)

    create_card_shape(s38, Inches(1.5), Inches(1.0), Inches(10.33), Inches(5.5), bg_color=COLOR_TITLE, border_color=COLOR_PRIMARY)
    tb = s38.shapes.add_textbox(Inches(1.8), Inches(1.3), Inches(9.73), Inches(4.9))
    tf = tb.text_frame
    tf.word_wrap = True

    p = tf.paragraphs[0]
    p.text = "THANK YOU"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(36)
    p.font.bold = True
    p.font.color.rgb = RGBColor(45, 212, 191)
    p.alignment = PP_ALIGN.CENTER
    p.space_after = Pt(8)

    p = tf.add_paragraph()
    p.text = "Questions & Answers / Discussion"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(20)
    p.font.bold = True
    p.font.color.rgb = COLOR_WHITE
    p.alignment = PP_ALIGN.CENTER
    p.space_after = Pt(16)

    p = tf.add_paragraph()
    p.text = "VISION BASED SMART COMMUNICATION SYSTEM FOR SIGN LANGUAGE"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(13)
    p.font.bold = True
    p.font.color.rgb = RGBColor(245, 158, 11)
    p.alignment = PP_ALIGN.CENTER

    p = tf.add_paragraph()
    p.text = "Government Engineering College Ramanagara | Department of CSE"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(11.5)
    p.font.color.rgb = RGBColor(148, 163, 184)
    p.alignment = PP_ALIGN.CENTER
    p.space_after = Pt(14)

    p = tf.add_paragraph()
    p.text = "Under the Guidance of: Dr. Chaya K, Assistant Professor, Dept. of CSE"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(11)
    p.font.color.rgb = COLOR_WHITE
    p.alignment = PP_ALIGN.CENTER

    p = tf.add_paragraph()
    p.text = "Team: Anupama G N (1GG23CS007) | Darshan Divakar Naik (1GG23CS016) | Hithaishi M (1GG23CS021) | Keerthana H S (1GG23CS026)"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(10.5)
    p.font.color.rgb = RGBColor(203, 213, 225)
    p.alignment = PP_ALIGN.CENTER
    p.space_after = Pt(14)

    p = tf.add_paragraph()
    p.text = "★ Live Interactive Demonstration Ready for Panel Evaluation ★"
    p.font.name = FONT_FAMILY
    p.font.size = Pt(12)
    p.font.bold = True
    p.font.color.rgb = RGBColor(45, 212, 191)
    p.alignment = PP_ALIGN.CENTER

    # Save to primary locations
    out1 = r"c:\Users\DELL\OneDrive\Desktop\G2T2G\VISION_BASED_SMART_COMMUNICATION_SYSTEM_FOR_SIGN_LANGUAGE_COMPLETE.pptx"
    out2 = r"c:\Users\DELL\OneDrive\Desktop\G2T2G\G2T2G_Final_Presentation.pptx"
    prs.save(out1)
    prs.save(out2)
    print(f"Unified presentation saved with {len(prs.slides)} slides successfully to:\n{out1}\n{out2}")

if __name__ == "__main__":
    build()

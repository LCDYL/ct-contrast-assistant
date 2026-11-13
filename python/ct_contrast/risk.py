"""Risk scoring and result explanations from the deployed classroom prototype."""

from .parameters import ACCESS_TEXT, f0, f1


LEVEL_TEXT = ("无", "低", "中", "高", "极高")
VERDICT_TEXT = {"ok": "可按方案执行", "caution": "谨慎执行", "hold": "暂缓或替代"}


def _score_parts(rules):
    matched = [(points, label) for condition, points, label in rules if condition]
    return sum(points for points, _ in matched), [label for _, label in matched]


def _level(score, cutoffs):
    return sum(score > cutoff for cutoff in cutoffs)


def _scores(form, p):
    egfr = p["egfr"]
    age = p["age"]
    nyha = p["nyha"]
    ef = p["ef"]
    bnp = p["bnp"]
    bp = p["bp"]
    prior = int(form.get("priorReaction") or 0)
    asthma = int(form.get("asthma") or 0)
    metformin = form.get("metformin", "none")

    allergy_score, allergy_parts = _score_parts([
        (prior == 1, 1, "既往轻度反应 +1"),
        (prior == 2, 3, "既往中度反应 +3"),
        (prior == 3, 4, "既往重度反应 +4"),
        (form.get("drugMulti"), 2, "多种药物过敏 +2"),
        (form.get("drugSevere"), 3, "严重过敏反应史 +3"),
        (form.get("drugBeta") or form.get("drugCeph") or form.get("drugSulfa"),
         0.5, "单类抗生素过敏 +0.5"),
        (form.get("foodSeafood") or form.get("foodNuts"), 1, "食物过敏 +1"),
        (asthma > 0, asthma, f"哮喘 +{asthma}"),
        (form.get("atopy"), 1, "特应性疾病 +1"),
        (form.get("mastocytosis"), 2, "肥大细胞增多症 +2"),
        (form.get("anxiety"), 0.5, "焦虑/不配合 +0.5"),
    ])
    allergy_level = _level(allergy_score, (0, 2, 4, 6))

    aki_score, aki_parts = _score_parts([
        (egfr is not None and egfr < 15, 8, "eGFR < 15 +8"),
        (egfr is not None and 15 <= egfr < 30, 6, "eGFR < 30 +6"),
        (egfr is not None and 30 <= egfr < 45, 4, "eGFR 30–44 +4"),
        (egfr is not None and 45 <= egfr < 60, 2, "eGFR 45–59 +2"),
        (p["dm"], 1, "糖尿病 +1"),
        (nyha >= 2, 1, "心衰 +1"),
        (age >= 75, 1, "年龄 ≥ 75 +1"),
        (form.get("dehydration"), 1, "低血容量 +1"),
        (form.get("myeloma"), 1, "骨髓瘤 +1"),
        (form.get("nephrotox"), 1, "肾毒性药物 +1"),
        (form.get("singleKidney"), 1, "单肾 +1"),
        (form.get("recentCM"), 2, "48 h 内重复 +2"),
    ])
    aki_level = _level(aki_score, (1, 3, 5, 7))
    if p["dialysis"] != "none":
        aki_level = 2 if p["volumeLimited"] else 0

    ef_score = 0 if ef is None else sum(ef < threshold for threshold in (50, 40, 30))
    nyha_grade = ("", "I", "II", "III", "IV")[nyha]
    heart_score, heart_parts = _score_parts([
        (nyha, nyha, f"NYHA {nyha_grade} +{nyha}"),
        (ef_score, ef_score, f"EF {f0(ef)}% +{ef_score}" if ef_score else ""),
        (bnp, bnp * 0.5, f"BNP {bnp} 级 +{bnp * 0.5:g}"),
        (form.get("pah"), 1, "肺动脉高压 +1"),
        (form.get("as"), 1, "重度主动脉瓣狭窄 +1"),
        (bp == "low", 1, "血压偏低 +1"),
        (bp == "shock", 2, "休克 +2"),
        (form.get("chfHosp"), 1, "近期心衰住院 +1"),
    ])
    heart_level = _level(heart_score, (0.5, 2, 4, 6))

    met_score, met_level, met_parts = "未用", -1, []
    if metformin != "none":
        score, met_parts = _score_parts([
            (egfr is None, 2, "eGFR 未评估 +2"),
            (egfr is not None and egfr >= 60, 1, "eGFR ≥ 60 +1"),
            (egfr is not None and 45 <= egfr < 60, 2, "eGFR 45–59 +2"),
            (egfr is not None and 30 <= egfr < 45, 3, "eGFR 30–44 +3"),
            (egfr is not None and egfr < 30, 4, "eGFR < 30 +4"),
            (age >= 75, 1, "年龄 ≥ 75 +1"),
            (65 <= age < 75, 0.5, "年龄 65–74 +0.5"),
            (metformin == "2000", 1, "剂量 2000 mg +1"),
            (metformin == "1500", 0.5, "剂量 1500 mg +0.5"),
            (metformin == "gt2000", 1.5, "剂量 > 2000 mg +1.5"),
        ])
        met_score = f"{score:.1f}"
        met_level = 1 + _level(score, (2, 3.5, 5.5))

    extra_score, ex_parts = _score_parts([
        (form.get("priorExtrav"), 2, "既往外渗 +2"),
        (form.get("chemo"), 1, "化疗史 +1"),
        (form.get("edema"), 1, "上肢水肿 +1"),
        (age >= 75, 1, "高龄 +1"),
        (form.get("anxiety"), 1, "无法配合 +1"),
    ])
    gauge_score = {"22": 3, "20": 2, "18": 0, "cv": -2, "picc": -1, "port": -1}
    site_score = {"hand": 2, "forearm": 1, "antecubital": 0, "other": 1}
    vein_score = {"poor": 2, "fair": 1}
    ex_score = max(
        0,
        extra_score + gauge_score.get(p["gauge"], 2)
        + site_score.get(p["site"], 1) + vein_score.get(p["vein"], 0),
    )
    ex_level = _level(ex_score, (1, 3, 5, 7))

    return [
        {"name": "急性不良反应 / 过敏", "level": allergy_level,
         "score": f"{allergy_score:.1f}", "parts": allergy_parts},
        {"name": "对比剂相关肾损伤 (PC-AKI)", "level": aki_level,
         "score": str(aki_score), "parts": aki_parts},
        {"name": "心功能 / 容量负荷", "level": heart_level,
         "score": f"{heart_score:.1f}", "parts": heart_parts},
        {"name": "二甲双胍相关乳酸酸中毒", "level": met_level,
         "score": met_score, "parts": met_parts},
        {"name": "静脉外渗", "level": ex_level, "score": str(ex_score), "parts": ex_parts},
    ]


def _flags(form, p, risks):
    allergy_level, _, heart_level, met_level, ex_level = [risk["level"] for risk in risks]
    egfr = p["egfr"]
    dialysis = p["dialysis"]
    volume = p["volume"]
    exam = p["exam"]
    hr = p["hr"]
    flags = []

    def add(severity, text):
        flags.append({"sev": severity, "text": text})

    if egfr is not None and egfr < 30 and dialysis == "none":
        add("danger", f"<b>eGFR {egfr}（G5）</b>：原则上避免碘对比剂。"
            "如临床必需，须肾内科会诊、限量 ≤ 60 mL、强化水化，并签署知情同意。")
    elif egfr is not None and egfr < 45:
        add("danger", f"<b>eGFR {egfr}（{p['ckd']}）</b>：对比剂肾病风险显著升高，"
            f"总量控制在 {f0(volume)} mL 以内，术前 4–6 h 开始等渗盐水水化。")
    elif egfr is not None and egfr < 60:
        add("warn", f"<b>eGFR {egfr}（G3a）</b>：轻中度肾功能下降，加强监测，"
            "避免 48 h 内重复使用对比剂。")
    elif egfr is None:
        add("warn", "未填写血肌酐，无法评估肾功能。建议补充肌酐/近期 eGFR 后再决定用量。")

    if form.get("hyperthyroid"):
        add("danger", "<b>甲亢未控制</b>：碘负荷可诱发甲状腺危象，应先由内分泌科控制甲亢，除非为抢救性检查。")
    if form.get("preg") == "pregnant":
        add("danger", "<b>妊娠期</b>：仅在获益明确大于风险时使用，并与产科共同决策；优先考虑 MRI 或超声替代。")
    if form.get("preg") == "lactating":
        add("info", "哺乳期：单次碘对比剂后可继续哺乳，无需停乳（ACR 2024）。")
    if form.get("pheo"):
        add("warn", "<b>嗜铬细胞瘤</b>：理论上可诱发儿茶酚胺释放，需 α 受体阻滞准备到位，检查中严密监测血压。")
    if form.get("myasthenia"):
        add("warn", "<b>重症肌无力</b>：对比剂可能加重肌无力症状，术后加强观察呼吸肌力量。")
    if form.get("myeloma"):
        add("warn", "多发性骨髓瘤：合并脱水时肾损伤风险升高，务必充分水化。")
    if form.get("dehydration"):
        add("warn", "存在低血容量/脱水：先补液纠正再注射对比剂，可显著降低肾损伤风险。")
    if form.get("recentCM"):
        add("warn", "48 h 内已使用碘对比剂：建议间隔 ≥ 48–72 h，非急诊应推迟。")
    if dialysis != "none":
        add("info", "透析患者不存在对比剂肾病风险，但需控制容量负荷；建议检查后 4–6 h 内安排透析。")
    if form.get("as"):
        add("warn", "重度主动脉瓣狭窄：注射引起的血流动力学波动耐受差，降低流率并连续监测血压。")
    if p["bp"] == "shock":
        add("danger", "休克状态：先稳定循环，对比剂注射可加重低血压，需麻醉/重症团队在场。")
    if met_level >= 3:
        add("danger", f"二甲双胍相关乳酸酸中毒风险{LEVEL_TEXT[met_level]}，建议内分泌科会诊并停用二甲双胍。")
    if allergy_level >= 3:
        add("danger", f"急性不良反应风险{LEVEL_TEXT[allergy_level]}：需强化预处理，注射现场备齐抢救药品与设备。")
    elif allergy_level == 2:
        add("warn", "存在过敏高危因素：建议标准预处理并延长注射后观察至 30 min。")
    if ex_level >= 3:
        add("danger", f"外渗风险{LEVEL_TEXT[ex_level]}：建议更换为 18G 以上肘正中静脉或中心静脉通路后再注射。")
    if p["accessFail"]:
        gauge_text = ACCESS_TEXT.get(p["gauge"], "该通路")
        required_flow = p["idrTarget"] * 1000 / p["conc"]
        add("danger", f"<b>当前通路无法满足目标碘流率</b>：{exam['label']} 需 {f1(p['idrTarget'])} gI/s，"
            f"即 {f1(required_flow)} mL/s，而{gauge_text}仅耐受 {f1(p['accessMax'])} mL/s。"
            "请更换 18G 以上前臂/肘正中静脉或中心静脉后再检查。")
    elif p["idrActual"] < exam["idr"] * 0.85:
        shortfall = (1 - p["idrActual"] / exam["idr"]) * 100
        add("warn", f"安全限幅后碘流率为 {f1(p['idrActual'])} gI/s（目标 {f1(exam['idr'])} gI/s，"
            f"−{f0(shortfall)}%），图像强化程度可能不足，可考虑延长采集或降低 kV 补偿。")
    if heart_level >= 3:
        add("warn", "心功能不全：控制总液体量，注射后监测呼吸、肺部湿啰音与尿量。")
    if p["pediatric"]:
        add("info", "儿童患者：按体重计算碘剂量（0.4 gI/kg），使用低压注射管路并全程陪护。")
    if hr > 80 and p["examKey"] == "coronary":
        hr_text = str(hr).removesuffix(".0")
        add("warn", f"心率 {hr_text} 次/分偏高：冠脉 CTA 建议先控制心率至 65–75 次/分（β 阻滞剂/伊伐布雷定）。")
    if form.get("lowdose"):
        add("info", "已启用低 kV / 低剂量方案：碘流率下调 30%，可配合迭代重建维持图像质量。")
    if volume <= 0:
        add("warn", "参数不完整，结果仅供参考。")

    return flags


def _actions(form, p, risks):
    allergy_level = risks[0]["level"]
    met_level = risks[3]["level"]
    ex_level = risks[4]["level"]
    egfr = p["egfr"]
    dialysis = p["dialysis"]
    actions = []

    def add(style, title, description):
        actions.append({"cls": style, "t": title, "d": description})

    if allergy_level >= 2:
        add("danger", f"预处理（过敏风险 {LEVEL_TEXT[allergy_level]}）",
            "甲泼尼龙 40 mg 静注：检查前 12 h 与 2 h 各一次；或泼尼松 50 mg 口服：前 13 h / 7 h / 1 h。"
            "加苯海拉明 50 mg 肌注（前 1 h）。哮喘患者加用吸入 β₂ 受体激动剂。"
            "急诊无法等待时：氢化可的松 200 mg 静注 + 苯海拉明 50 mg 静注，并全程备抢救。")
    if allergy_level == 4:
        add("danger", "考虑替代检查", "极高过敏风险，建议改用非碘对比剂方案（MRI 增强、超声造影或平扫），"
            "必须使用时由高年资医师在场并签署知情同意。")
    if egfr is not None and egfr < 45 and dialysis == "none":
        rate = 0.5 if p["heartSevere"] else 1
        heart_note = "合并心功能不全，减半并监测容量。" if p["heartSevere"] else ""
        add("warn", "水化方案", f"0.9% 氯化钠 {f1(rate * (p['w'] or 60))} mL/h（{rate} mL/kg/h），"
            f"术前 4–6 h 开始，持续至术后 6–12 h；维持尿量 > 0.5 mL/kg/h。{heart_note}")
    if met_level >= 0:
        met_score = float(risks[3]["score"])
        description = (
            "检查前 48 h 停用二甲双胍；检查后 48–72 h 复查血肌酐/eGFR，确认稳定后再恢复用药。"
            if egfr is not None and egfr < 60
            else "eGFR ≥ 60 者可不中断，但建议检查后 48 h 复查肾功能正常再恢复；如为动脉内给药则必须停药。"
        )
        add("danger" if met_level >= 3 else "warn",
            f"二甲双胍处理（评分 {met_score:g}，{LEVEL_TEXT[met_level]}风险）", description)
    if dialysis != "none":
        add("muted", "透析安排", "检查后 4–6 h 内安排透析，清除对比剂；无需额外预防性水化，注意透析间期容量评估。")
    if form.get("hyperthyroid"):
        add("danger", "甲状腺处理", "先控制甲亢（抗甲状腺药物 + β 阻滞剂），必要时内分泌科会诊后再行增强检查。")
    if ex_level >= 2 or p["accessFail"]:
        add("warn", "静脉通路", "建议改用 18G 及以上、肘正中/前臂粗直静脉；"
            "注射前回血确认、生理盐水试推 10 mL 无外渗，注射中每 15 s 触诊穿刺点。")
    if form.get("lowdose"):
        add("muted", "低剂量技术", "70–90 kVp + 迭代/深度学习重建，可用更低碘流率获得同等强化；噪声指数适度放宽。")
    add("muted", "注射后观察",
        "留观 30 min，前 10 min 每 3–5 min 巡视一次；迟发反应可至 1 周，告知患者返院指征。"
        if allergy_level >= 2 else "留观 15–30 min，出现皮疹、气促、恶心立即报告。")
    return actions


def _chain(p, risks, verdict):
    egfr = p["egfr"]
    crcl = p["crcl"] if p["crcl"] is not None else "null"
    exam = p["exam"]
    chain = [
        f"体型：身高 {f0(p['h'])} cm / 体重 {f1(p['w'])} kg，"
        f"<b>BMI {f1(p['bmi'])}</b>，BSA {f1(p['bsa'])} m²",
        f"肾功能：血肌酐 {f0(p['scr'])} μmol/L → <b>eGFR {egfr} mL/min/1.73m²（{p['ckd']}）</b>，"
        f"Cockcroft-Gault CrCl {crcl} mL/min"
        if egfr is not None else "肾功能：未提供血肌酐，跳过肾小球滤过评估",
        f"检查：<b>{exam['label']}</b>，基础目标碘流率 {f1(exam['idr'])} gI/s，"
        f"注射时长 {f0(p['dur'])} s",
    ]
    if p["idrNotes"]:
        chain.append(f"碘流率修正：{'；'.join(p['idrNotes'])} → <b>{f1(p['idrTarget'])} gI/s</b>")
    chain.extend([
        f"浓度决策：<b>{p['conc']} mgI/mL</b> —— {p['concReason']}",
        f"体积推算：{f1(p['idrTarget'])} gI/s × {f0(p['dur'])} s ÷ {p['conc']} mgI/mL = "
        f"{f1(p['volRaw'])} mL，流率 {f1(p['flowRaw'])} mL/s → "
        f"限幅后 <b>{f1(p['volume'])} mL</b> / {f1(p['flow'])} mL/s",
    ])
    if p["capLog"]:
        chain.append("安全限幅：" + "；".join(p["capLog"]))
    access_text = ACCESS_TEXT.get(p["gauge"], "外周")
    access_status = "⚠ 低于目标碘流率，需更换通路" if p["accessFail"] else "✓ 通过"
    allergy, aki, heart, extravasation = [LEVEL_TEXT[risks[i]["level"]] for i in (0, 1, 2, 4)]
    chain.extend([
        f"通路校验：{access_text}可耐受 {f1(p['accessMax'])} mL/s，实际 {f1(p['flow'])} mL/s {access_status}",
        f"实际碘流率：<b>{f1(p['idrActual'])} gI/s</b>（目标 {f1(p['idrTarget'])} gI/s），"
        f"碘总量 {f1(p['iodineTotal'])} gI",
        f"综合风险：过敏 {allergy} / 肾损伤 {aki} / 心功能 {heart} / 外渗 {extravasation} "
        f"→ <b>{VERDICT_TEXT[verdict]}</b>",
    ])
    return chain


def assess_risk(form: dict, params: dict) -> dict:
    risks = _scores(form, params)
    overall = max(risk["level"] for risk in risks)
    egfr = params["egfr"]
    severe_renal = egfr is not None and egfr < 30 and params["dialysis"] == "none"
    if form.get("hyperthyroid") or risks[1]["level"] == 4 or severe_renal or risks[0]["level"] == 4:
        verdict = "hold"
    elif overall >= 3:
        verdict = "caution"
    else:
        verdict = "ok"

    return {
        "risks": risks,
        "overall": overall,
        "verdict": verdict,
        "flags": _flags(form, params, risks),
        "actions": _actions(form, params, risks),
        "chain": _chain(params, risks, verdict),
    }

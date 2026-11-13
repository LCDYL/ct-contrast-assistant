"""CT 对比剂选择系统 v5.1 的参数计算。"""

import math


# 检查参数依次为名称、目标碘流率、注射时长、体积上限、碘流率上限和提示。
_EXAM_COLUMNS = ("label", "idr", "dur", "maxVol", "idrMax", "tip")
EXAMS = {
    key: dict(zip(_EXAM_COLUMNS, values))
    for key, values in {
        "coronary": (
            "冠状动脉 CTA", 1.50, 12, 80, 1.80,
            "升主动脉根部阈值 100 HU 触发，延迟 3–6 s；心率 > 75 次/分建议先控制心率",
        ),
        "triple": (
            "胸痛三联 (TRO)", 1.60, 15, 100, 1.85,
            "需同期显示右心、左心与主动脉，优先高浓度以压缩体积",
        ),
        "headneck": (
            "头颈动脉 CTA", 1.30, 12, 80, 1.55,
            "颈总动脉阈值 120 HU 团注追踪；关注颅底骨伪影与静脉污染",
        ),
        "ctpa": (
            "肺动脉 CTA", 1.30, 10, 70, 1.55,
            "肺动脉主干阈值 150–200 HU；右心功能不全者延长至 12–14 s",
        ),
        "aorta": (
            "主动脉 CTA", 1.40, 15, 110, 1.70,
            "全主动脉扫描建议 370 mgI/mL，流率不低于 4 mL/s",
        ),
        "abdomen": (
            "腹部常规增强", 1.10, 25, 110, 1.35,
            "动脉期 35–40 s，门静脉期 70–80 s",
        ),
        "liver": (
            "肝脏动态三期", 1.30, 25, 140, 1.55,
            "动脉晚期 35 s / 门脉期 70 s / 延迟 180 s，总量须覆盖三期",
        ),
        "ctu": (
            "泌尿系 CTU", 0.75, 40, 120, 1.00,
            "排泄期 8–10 min；分次注射可减少总量，检查前后充分水化",
        ),
        "leg": (
            "下肢动脉 CTA", 1.10, 30, 140, 1.40,
            "自足向头侧扫描减少静脉污染，总量按扫描长度调整",
        ),
        "perfusion": (
            "CT 灌注 (CTP)", 1.55, 12, 70, 1.80,
            "短时高流率注射，采集持续 45–60 s，注射结束后继续扫描",
        ),
        "routine": (
            "其他部位增强", 1.10, 25, 110, 1.35,
            "按部位设定延迟时间，常规门脉期为主",
        ),
    }.items()
}

# 部署版的首选和备选均取对应浓度组的第一种对比剂。
_AGENT_COLUMNS = ("name", "brand", "osm", "osmo", "cls")
_AGENTS = {
    concentration: dict(zip(_AGENT_COLUMNS, values))
    for concentration, values in {
        300: ("碘海醇 300", "欧乃派克 300", "低渗", 672, "非离子单体"),
        320: ("碘克沙醇 320", "威视派克 320", "等渗", 290, "非离子二聚体"),
        350: ("碘海醇 350", "欧乃派克 350", "低渗", 780, "非离子单体"),
        370: ("碘普罗胺 370", "优维显 370", "低渗", 774, "非离子单体"),
        400: ("碘美普尔 400", "典迈伦 400", "低渗", 726, "非离子单体"),
    }.items()
}

_ACCESS = {"22": 3.0, "20": 4.5, "18": 5.5, "cv": 5.0, "picc": 2.5, "port": 4.5}
ACCESS_TEXT = {
    "22": "22G 外周",
    "20": "20G 外周",
    "18": "18G 外周",
    "cv": "中心静脉导管",
    "picc": "PICC",
    "port": "输液港",
}


def number(form: dict, key: str) -> float:
    """读取表单数值，空白输入按 0 计算。"""
    value = form.get(key)
    if value is None or value == "":
        return 0.0
    return float(value)


def js_round(value: float) -> int:
    """与 Math.round 一致，恰好为半整数时向正无穷方向取整。"""
    lower = math.floor(value)
    return lower + int(value - lower >= 0.5)


def f0(value: float) -> str:
    return str(js_round(value))


def f1(value: float) -> str:
    return f"{js_round(value * 10) / 10:.1f}"


def body_metrics(height: float, weight: float) -> tuple[float, float]:
    if height <= 0 or weight <= 0:
        return 0.0, 0.0
    bmi = weight / math.pow(height / 100, 2)
    bsa = 0.007184 * math.pow(height, 0.725) * math.pow(weight, 0.425)
    return bmi, bsa


def body_label(bmi: float) -> str:
    if bmi < 18.5:
        return "偏瘦"
    if bmi < 24:
        return "正常"
    if bmi < 28:
        return "超重"
    return "肥胖"


def egfr_ckd_epi(scr_umol: float, age: float, sex: str) -> int | None:
    if scr_umol <= 0 or age <= 0:
        return None
    female = sex == "female"
    ratio = (scr_umol / 88.4) / (0.7 if female else 0.9)
    exponent = -0.241 if female else -0.302
    egfr = (
        142 * math.pow(min(ratio, 1), exponent) * math.pow(max(ratio, 1), -1.200)
        * math.pow(0.9938, age) * (1.012 if female else 1)
    )
    return max(1, js_round(egfr))


def crcl_cockcroft(scr_umol: float, age: float, weight: float, sex: str) -> int | None:
    if scr_umol <= 0 or age <= 0 or weight <= 0:
        return None
    crcl = (140 - age) * weight / (0.818 * scr_umol) * (0.85 if sex == "female" else 1)
    return max(1, js_round(crcl))


def gfr_category(egfr: int | None) -> str:
    if egfr is None:
        return "—"
    for lower, category in ((90, "G1"), (60, "G2"), (45, "G3a"), (30, "G3b"), (15, "G4")):
        if egfr >= lower:
            return category
    return "G5"


def _target_idr(
    exam: dict, bmi: float, heart_severe: bool, renal_mid: bool, low_dose: bool
) -> tuple[float, list[str]]:
    target = exam["idr"]
    notes = []
    if bmi >= 35:
        target *= 1.15
        notes.append("BMI ≥ 35，碘流率 +15%")
    elif bmi >= 28:
        target *= 1.08
        notes.append("BMI ≥ 28，碘流率 +8%")
    elif 0 < bmi < 18.5:
        target *= 0.95
        notes.append("低体重，碘流率 −5%")
    if heart_severe:
        target *= 0.85
        notes.append("心功能不全，碘流率 −15%")
    if renal_mid:
        target *= 0.92
        notes.append("eGFR < 45，碘流率 −8%")
    if low_dose:
        target *= 0.70
        notes.append("低 kV / 低剂量方案，碘流率 −30%")
    return min(max(target, exam["idr"] * 0.55), exam["idrMax"]), notes


def _initial_concentration(
    pediatric: bool, prefer_iso: bool, volume_limited: bool,
    access_max: float, idr_target: float, bmi: float,
) -> tuple[int, str]:
    if pediatric:
        return 320, "儿童患者选 300–320 mgI/mL，按体重计算碘剂量，减少渗透负荷"
    if prefer_iso:
        return 320, "肾功能受损合并糖尿病/高龄，优先等渗对比剂（碘克沙醇 320）"
    if volume_limited:
        return 370, "心功能不全需限制总液体量，选高浓度以减少注射体积"
    if access_max <= 3.0:
        return 370, "静脉通路受限，选高浓度以在低流率下达到目标碘流率"
    if idr_target >= 1.42:
        return 370, "检查需高碘流率，370 mgI/mL 可在可接受流率下达成"
    if bmi >= 28:
        return 370, "体重指数偏高，提高浓度以补偿体型衰减"
    return 350, "常规体型与通路，350 mgI/mL 为标准选择"


def _alternatives(conc: int, prefer_iso: bool, actual_idr: float, duration: float) -> list[dict]:
    alternatives = []
    for candidate, agent in _AGENTS.items():
        if candidate == conc or (prefer_iso and candidate == 370):
            continue
        if candidate < conc:
            volume = f1(actual_idr * duration * 1000 / candidate)
            why = f"浓度更低，注射体积 {volume} mL，渗透负荷更小，适合肾功能临界或需大量冲洗的检查"
        else:
            flow = f1(actual_idr * 1000 / candidate)
            why = f"浓度更高，同碘流率下流率可降至 {flow} mL/s，适合静脉通路差或需限容"
        alternatives.append({"name": agent["name"], "conc": candidate, "osm": agent["osm"], "why": why})
    return alternatives


def calculate_parameters(form: dict) -> dict:
    age = number(form, "age")
    sex = form.get("sex") or "male"
    height = number(form, "height")
    weight = number(form, "weight")
    hr = number(form, "hr")
    bmi, bsa = body_metrics(height, weight)
    pediatric = 0 < age < 18

    scr = number(form, "scr")
    egfr = egfr_ckd_epi(scr, age, sex)
    crcl = crcl_cockcroft(scr, age, weight, sex)
    dialysis = form.get("dialysis", "none")
    dm = bool(form.get("dm"))
    renal_impaired = egfr is not None and egfr < 60
    renal_mid = egfr is not None and egfr < 45
    renal_severe = egfr is not None and egfr < 30

    nyha = int(number(form, "nyha"))
    ef_input = number(form, "ef")
    ef = ef_input if ef_input > 0 else None
    bnp = int(number(form, "bnp"))
    bp = form.get("bp", "normal")
    heart_severe = nyha >= 3 or (ef is not None and ef < 40)
    volume_limited = heart_severe or bp == "shock"

    exam_key = form.get("exam") or "coronary"
    exam = EXAMS[exam_key]
    dur_input = number(form, "dur")
    duration = dur_input if dur_input > 0 else exam["dur"]
    max_flow_input = number(form, "maxflow")

    gauge = str(form.get("gauge", ""))
    site = form.get("site", "forearm")
    vein = form.get("vein", "good")
    access_max = _ACCESS.get(gauge, 4.0)
    if site in ("hand", "other"):
        access_max -= 0.5
    if vein == "fair":
        access_max -= 0.3
    if vein == "poor":
        access_max -= 1.0
    if form.get("edema"):
        access_max -= 0.5
    if form.get("priorExtrav"):
        access_max -= 0.5
    if max_flow_input > 0:
        access_max = min(access_max, max_flow_input)
    access_max = max(1.0, js_round(access_max * 10) / 10)

    idr_target, idr_notes = _target_idr(exam, bmi, heart_severe, renal_mid, bool(form.get("lowdose")))
    prefer_iso = renal_severe or (renal_mid and (dm or age >= 75))
    conc, conc_reason = _initial_concentration(
        pediatric, prefer_iso, volume_limited, access_max, idr_target, bmi
    )

    cap_log = []
    access_fail = False
    raw_volume = raw_flow = 0
    if pediatric:
        volume = 0.40 * weight * 1000 / conc
        pediatric_cap = 2.4 * weight
        if volume > pediatric_cap:
            cap_log.append(f"儿童剂量上限 {f0(pediatric_cap)} mL（2.4 mL/kg）")
            volume = pediatric_cap
        if volume / duration > access_max:
            volume = access_max * duration
            access_fail = True
    else:
        volume = idr_target * duration * 1000 / conc
        flow = volume / duration
        raw_volume, raw_flow = volume, flow

        tolerance = access_max * 1.03
        if flow > tolerance and not prefer_iso:
            for candidate in (350, 370, 400):
                if candidate <= conc:
                    continue
                candidate_flow = idr_target * 1000 / candidate
                if candidate_flow <= tolerance:
                    conc_reason += f"；原流率 {f1(flow)} mL/s 超通路耐受，改用 {candidate} mgI/mL"
                    conc, flow = candidate, candidate_flow
                    volume = flow * duration
                    break

        if flow > tolerance:
            required_duration = volume / access_max
            if required_duration <= duration * 1.5:
                duration = math.ceil(required_duration)
                cap_log.append(f"延长注射时长至 {duration} s，使流率降至通路耐受范围 {f1(access_max)} mL/s")
            else:
                cap_log.append(
                    f"通路耐受上限 {f1(access_max)} mL/s，实际流率 {f1(flow)} mL/s → 降至 {f1(access_max)} mL/s"
                )
                volume = access_max * duration
                access_fail = True

    def cap(limit: float, reason: str) -> None:
        nonlocal volume
        if volume > limit + 0.05:
            cap_log.append(f"{reason}：{f1(volume)} → {f1(limit)} mL")
            volume = limit

    cap(exam["maxVol"], f'{exam["label"]}总量上限')
    if renal_severe and dialysis == "none":
        cap(60, "eGFR < 30 强化限量")
    elif renal_mid and dialysis == "none":
        cap(80, "eGFR 30–44 限量")
    if nyha >= 4 or (ef is not None and ef < 30):
        cap(60, "重度心功能不全限容")
    elif nyha == 3 or (ef is not None and 30 <= ef < 40):
        cap(85, "心功能不全限容")
    if not pediatric and weight > 0:
        cap(2.6 * weight, "按体重上限 2.6 mL/kg")
    if age >= 80 and dialysis == "none":
        volume *= 0.9
        cap_log.append("年龄 ≥ 80 岁，总量再减 10%")
    if form.get("recentCM") and volume > 50:
        cap(50, "48 h 内重复使用，单次限量")

    flow = min(max(volume / duration, 0.5), access_max)
    volume = flow * duration
    iodine_total = volume * conc / 1000
    actual_idr = iodine_total / duration
    saline = js_round(weight) if pediatric else (30 if conc >= 370 else 25)
    primary = _AGENTS[320 if prefer_iso else conc]

    return {
        "bmi": bmi,
        "bsa": bsa,
        "bodyText": f"{body_label(bmi)}（{f1(bmi)}）" if bmi > 0 else "—",
        "egfr": egfr,
        "crcl": crcl,
        "ckd": gfr_category(egfr),
        "age": age,
        "sex": sex,
        "w": weight,
        "exam": exam.copy(),
        "dur": duration,
        "conc": conc,
        "primary": primary.copy(),
        "volume": volume,
        "flow": flow,
        "idrActual": actual_idr,
        "iodineTotal": iodine_total,
        "saline": saline,
        "alts": _alternatives(conc, prefer_iso, actual_idr, duration),
        "accessMax": access_max,
        "capLog": cap_log,
        "concReason": conc_reason,
        "idrTarget": idr_target,
        "accessFail": access_fail,
        "pediatric": pediatric,
        "h": height,
        "hr": hr,
        "scr": scr,
        "dialysis": dialysis,
        "dm": dm,
        "renalImpair": renal_impaired,
        "renalMid": renal_mid,
        "renalSevere": renal_severe,
        "nyha": nyha,
        "ef": ef,
        "bnp": bnp,
        "bp": bp,
        "heartSevere": heart_severe,
        "volumeLimited": volume_limited,
        "examKey": exam_key,
        "gauge": gauge,
        "site": site,
        "vein": vein,
        "idrNotes": idr_notes,
        "volRaw": raw_volume,
        "flowRaw": raw_flow,
    }

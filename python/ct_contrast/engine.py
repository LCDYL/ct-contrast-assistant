"""供网页调用的决策引擎和实时指标。"""

from .parameters import (
    body_label,
    body_metrics,
    calculate_parameters,
    crcl_cockcroft,
    egfr_ckd_epi,
    gfr_category,
    number,
)
from .risk import assess_risk


RESULT_FIELDS = (
    'bmi', 'bsa', 'bodyText', 'egfr', 'crcl', 'ckd', 'age', 'sex', 'w', 'exam',
    'dur', 'conc', 'primary', 'volume', 'flow', 'idrActual', 'iodineTotal',
    'saline', 'alts', 'accessMax', 'capLog', 'concReason', 'idrTarget',
    'accessFail', 'pediatric',
)


def evaluate(form: dict) -> dict:
    """返回注射参数、风险等级和决策说明。"""
    parameters = calculate_parameters(form)
    result = {key: parameters[key] for key in RESULT_FIELDS}
    result.update(assess_risk(form, parameters))
    return result


def preview(form: dict) -> dict:
    """计算填写向导中随输入更新的基础指标。"""
    age = number(form, 'age')
    height = number(form, 'height')
    weight = number(form, 'weight')
    scr = number(form, 'scr')
    sex = form.get('sex') or 'male'
    bmi, bsa = body_metrics(height, weight)
    egfr = egfr_ckd_epi(scr, age, sex)
    return {
        'bmi': bmi,
        'bsa': bsa,
        'body': body_label(bmi),
        'egfr': egfr,
        'ckd': gfr_category(egfr),
        'crcl': crcl_cockcroft(scr, age, weight, sex),
    }

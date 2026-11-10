import hashlib
import re

RUT_PATTERN = re.compile(r"^(\d{2})\.(\d{3})\.(\d{3})-([0-9Kk])$")
RUT_MIN = 76_000_000
RUT_MAX = 79_999_999


def rut_check_digit(number: int) -> str:
    total = 0
    factor = 2
    for digit in reversed(str(number)):
        total += int(digit) * factor
        factor = 2 if factor == 7 else factor + 1
    result = 11 - total % 11
    if result == 11:
        return "0"
    if result == 10:
        return "K"
    return str(result)


def normalize_company_rut(value: str) -> tuple[str, str] | None:
    if not isinstance(value, str):
        return None
    match = RUT_PATTERN.fullmatch(value.strip())
    if not match:
        return None
    number = int("".join(match.groups()[:3]))
    check_digit = match.group(4).upper()
    if not RUT_MIN <= number <= RUT_MAX or rut_check_digit(number) != check_digit:
        return None
    return f"{number}-{check_digit}", format_company_rut(number, check_digit)


def format_company_rut(number: int, check_digit: str | None = None) -> str:
    digits = str(number)
    grouped = f"{digits[:-6]}.{digits[-6:-3]}.{digits[-3:]}"
    return f"{grouped}-{check_digit or rut_check_digit(number)}"


def synthetic_company_rut(seed: str, occupied: set[str] | None = None) -> str:
    occupied = occupied or set()
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    candidate = RUT_MIN + int.from_bytes(digest[:4], "big") % (RUT_MAX - RUT_MIN + 1)
    for offset in range(RUT_MAX - RUT_MIN + 1):
        number = RUT_MIN + (candidate - RUT_MIN + offset) % (RUT_MAX - RUT_MIN + 1)
        normalized = f"{number}-{rut_check_digit(number)}"
        if normalized not in occupied:
            return format_company_rut(number)
    raise RuntimeError("No quedan RUT sintéticos disponibles en el rango configurado.")

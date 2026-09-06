#!/usr/bin/env python3
"""Fill the official Plan de Choque activity-memory template with a cautious draft.

The source template is kept intact; this script writes a new DOCX and only edits
the intended content-control text and the budget table inside document.xml.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import etree


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W_NS}


def w(local: str) -> str:
    return f"{{{W_NS}}}{local}"


def all_text_nodes(element):
    return element.xpath(".//w:t", namespaces=NS)


def set_control_text(sdt, text: str, *, black: bool = True) -> None:
    """Replace visible text while preserving the control and its paragraph/run style."""
    nodes = all_text_nodes(sdt)
    if not nodes:
        return
    nodes[0].text = text
    for node in nodes[1:]:
        node.text = ""
    if black:
        content = sdt.find("w:sdtContent", namespaces=NS)
        if content is not None:
            # The official template uses a placeholder character style for
            # free-text fields. Remove it so filled draft text is rendered as
            # ordinary black body text rather than gray prompt text.
            for rstyle in content.xpath(".//w:rStyle", namespaces=NS):
                rstyle.getparent().remove(rstyle)
            for rpr in content.xpath(".//w:rPr", namespaces=NS):
                color = rpr.find("w:color", namespaces=NS)
                if color is None:
                    color = etree.SubElement(rpr, w("color"))
                color.set(w("val"), "000000")


def set_checkbox(sdt, checked: bool) -> None:
    set_control_text(sdt, "☒" if checked else "☐", black=True)


def set_cell_text(cell, text: str) -> None:
    nodes = all_text_nodes(cell)
    if not nodes:
        p = cell.find(".//w:p", namespaces=NS)
        if p is None:
            p = etree.SubElement(cell, w("p"))
        r = etree.SubElement(p, w("r"))
        etree.SubElement(r, w("t")).text = text
        return
    nodes[0].text = text
    for node in nodes[1:]:
        node.text = ""


def replace_document_xml(data: bytes) -> bytes:
    root = etree.fromstring(data)
    controls = root.xpath(".//w:sdt", namespaces=NS)
    if len(controls) < 31:
        raise RuntimeError(f"Unexpected template structure: {len(controls)} content controls")

    # Known applicant information is intentionally left as a placeholder until
    # the applicant/legal entity is confirmed.
    values = {
        0: "[PENDIENTE DE CONFIRMAR]",
        1: "[PENDIENTE DE COMPLETAR]",
        2: "Restaurant Sol",
        3: "c/ del Clot, 123, Barcelona",
        11: ": un horno industrial eléctrico antiguo CSB-CISABA, modelo/tipo MSUPERIORE UMI, por un horno combinado eléctrico profesional RATIONAL iCombi Pro 6-1/1 E. El nuevo equipo asumirá también, de forma funcional, las principales funciones de cocción de la plancha industrial de gas grande existente.",
        14: (
            "Elemento existente: horno industrial eléctrico CSB-CISABA, modelo/tipo MSUPERIORE UMI, "
            "número de serie 20250512002, potencia nominal 5,6 kW y alimentación 380–415 V, 3PH + N + PE, "
            "50/60 Hz, según la fotografía legible de la placa de características. Elemento adquirido: "
            "RATIONAL iCombi Pro 6-1/1 E, referencia CB1ERRA.0000817, horno combinado eléctrico "
            "profesional de 6 x 1/1 GN, potencia de conexión 10,8 kW y alimentación 3 NAC 400 V. "
            "Dimensiones aproximadas 850 x 775 x 754 mm; toma de agua R 3/4, desagüe DN 50 y presión "
            "de agua de 1,0 a 6,0 bar. Se instalará con la mesa de soporte RATIONAL 60.31.046."
        ),
        15: (
            "La sustitución permitirá modernizar el equipamiento de cocina, mejorar el control de "
            "temperatura, humedad y tiempos de cocción, y realizar distintos procesos con un único "
            "equipo profesional. El RATIONAL asumirá funcionalmente las principales tareas de cocción "
            "que actualmente se realizan con el horno antiguo y con la plancha industrial de gas grande, "
            "que dejará de utilizarse para cocinar y, si permanece en el local, se conservará únicamente "
            "como superficie de trabajo. Se espera una producción más controlada, reproducible y rápida; "
            "la comparación energética deberá considerar no solo la potencia nominal, sino también la "
            "capacidad, el tiempo real de funcionamiento, la carga procesada y el cambio global en el uso "
            "de la plancha de gas."
        ),
        20: "Sustitución de maquinaria industrial hostelera",
        22: "[PEND.]",
        23: (
            "Presupuesto provisional basado en la oferta 2026/0027/2206 de fecha 22/06/2026. "
            "La oferta debe ser revisada para confirmar el proveedor contractual, la base imponible, "
            "el IVA y el alcance real de las instalaciones en la ubicación definitiva; la partida anterior "
            "de 2.500 € por desagües y mano de obra no se trasladará automáticamente. La plancha eléctrica, "
            "la compra de una nueva plancha de gas, la retirada de la plancha grande y el armario de congelación "
            "no se incluyen en esta solicitud. El proyecto se presenta como sustitución del horno antiguo y "
            "sustitución funcional de las tareas de cocción de la plancha mediante el horno RATIONAL y su mesa de soporte."
        ),
    }
    for idx, value in values.items():
        set_control_text(controls[idx], value)

    # Industrial kitchen machinery is the relevant category for the oven.
    for idx, checked in {5: False, 6: True, 7: False, 8: False, 9: False}.items():
        set_checkbox(controls[idx], checked)

    # The work is planned, not completed, at the time of this draft.
    set_checkbox(controls[16], False)
    set_checkbox(controls[17], True)

    # Use the technical-report route; energy labels generally do not apply to
    # this type of professional industrial cooking machinery.
    set_checkbox(controls[24], False)
    set_checkbox(controls[25], True)
    set_checkbox(controls[26], True)

    # The acquisition date does not apply to a planned action; the planned
    # execution date still needs to be agreed with the supplier.
    set_control_text(controls[18], "No aplica — actuación pendiente")
    set_control_text(controls[19], "[PENDIENTE DE CONFIRMAR]")

    # Leave the signature date fields visibly unresolved while preserving the
    # official template's day/month/year layout.
    for idx, value in {27: "DÍA", 28: "N.º", 29: "MES", 30: "_"}.items():
        set_control_text(controls[idx], value)

    # The table is nested inside a content control, so python-docx does not
    # expose it as a normal document table. Keep the official structure and
    # fill only the provisional rows.
    table = controls[21].find(".//w:tbl", namespaces=NS)
    if table is None:
        raise RuntimeError("Budget table not found in official template")
    rows = table.findall("w:tr", namespaces=NS)
    if len(rows) < 8:
        raise RuntimeError("Unexpected budget table row count")

    row_values = {
        1: ["Inversión en equipos y materiales", "[PENDIENTE]", "9.085,16*", "[PEND.]", "[PEND.]"],
        2: ["Costes de ejecución de las obras y/o instalaciones", "[PENDIENTE]", "[PEND.]", "[PEND.]", "[PEND.]"],
        3: ["Costes de gestión de residuos generados por la renovación del equipamiento", "—", "—", "—", "—"],
        4: ["Honorarios profesionales para la elaboración del certificado de eficiencia energética", "[PENDIENTE]", "[PEND.]", "[PEND.]", "[PEND.]"],
        5: ["Gastos de gestión", "—", "—", "—", "—"],
        6: ["Gastos de justificación", "—", "—", "—", "—"],
    }
    for row_idx, values_row in row_values.items():
        cells = rows[row_idx].findall("w:tc", namespaces=NS)
        for cell, value in zip(cells, values_row):
            set_cell_text(cell, value)

    total_cells = rows[7].findall("w:tc", namespaces=NS)
    total_values = ["Importe total provisional", "[PEND.]", "[PEND.]", "[PEND.]" if len(total_cells) == 4 else ""]
    for cell, value in zip(total_cells, total_values):
        set_cell_text(cell, value)

    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone="yes")


def build(source: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(source, "r") as zin:
        parts = {name: zin.read(name) for name in zin.namelist()}
    parts["word/document.xml"] = replace_document_xml(parts["word/document.xml"])
    with ZipFile(output, "w", ZIP_DEFLATED) as zout:
        for name, data in parts.items():
            zout.writestr(name, data)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.source, args.output)
    print(args.output)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Create a no-data review draft from the official declaration template.

The output deliberately keeps all factual declarations and de minimis choices
unchecked. It is a review aid, not a filing document.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from lxml import etree


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W_NS}


def w(local: str) -> str:
    return f"{{{W_NS}}}{local}"


def all_text_nodes(element):
    return element.xpath(".//w:t", namespaces=NS)


def set_control_text(control, text: str) -> None:
    nodes = all_text_nodes(control)
    if not nodes:
        return
    nodes[0].text = text
    for node in nodes[1:]:
        node.text = ""


def replace_document_xml(data: bytes) -> bytes:
    root = etree.fromstring(data)
    controls = root.xpath(".//w:sdt", namespaces=NS)
    if len(controls) != 24:
        raise RuntimeError(f"Unexpected official template structure: {len(controls)} controls")

    field_values = {
        0: "[NOMBRE DEL FIRMANTE — PENDIENTE]",
        1: "[NIF DEL FIRMANTE — PENDIENTE]",
        2: "[RAZÓN SOCIAL — PENDIENTE]",
        3: "[CIF — PENDIENTE]",
        10: "[NOMBRE DEL FIRMANTE — PENDIENTE]",
        11: "[NIF DEL FIRMANTE — PENDIENTE]",
        12: "[RAZÓN SOCIAL — PENDIENTE]",
        13: "[CIF — PENDIENTE]",
        20: "[LUGAR — PENDIENTE]",
        21: "[DÍA]",
        22: "[MES]",
        23: "[AÑO]",
    }
    for index, value in field_values.items():
        set_control_text(controls[index], value)

    # Declaration I: six factual statements; Declaration II: three mutually
    # exclusive de minimis choices. None may be preselected without user facts.
    for index in [4, 5, 6, 7, 8, 9, 14, 15, 18]:
        set_control_text(controls[index], "☐")

    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone="yes")


def build(source: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(source, "r") as source_zip:
        parts = {name: source_zip.read(name) for name in source_zip.namelist()}
    parts["word/document.xml"] = replace_document_xml(parts["word/document.xml"])
    with ZipFile(output, "w", ZIP_DEFLATED) as output_zip:
        for name, data in parts.items():
            output_zip.writestr(name, data)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    build(args.source, args.output)
    print(args.output)


if __name__ == "__main__":
    main()

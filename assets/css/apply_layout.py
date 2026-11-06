#!/usr/bin/env python3
"""Usage: python3 apply_layout.py index.html
Adds .layout-container-lg to section wrappers and links assets/css/layout.css."""
import re, sys, shutil

path = sys.argv[1] if len(sys.argv) > 1 else "index.html"
shutil.copy(path, path + ".bak")
html = open(path, encoding="utf-8").read()

targets = [
    "group-9", "group-73", "group-77", "group-84", "group-103", "group-110",
    "group-136", "group-150", "testimonials-section", "faq-section", "group-191", "group-218",
    "ai-modernization__container",
]
for cls in targets:
    html = re.sub(r'class="%s"' % re.escape(cls),
                  'class="%s layout-container-lg"' % cls, html)

link = '<link rel="stylesheet" href="assets/css/layout.css" />'
if link not in html:
    html = html.replace(
        '<link rel="stylesheet" href="assets/css/responsive.css" />',
        '<link rel="stylesheet" href="assets/css/responsive.css" />\n    ' + link, 1)

open(path, "w", encoding="utf-8").write(html)
print("Patched", path, "(backup:", path + ".bak)")
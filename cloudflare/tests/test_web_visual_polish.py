from pathlib import Path
import colorsys
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
WEB_SRC = ROOT / "web" / "src"
STYLE_FILES = (
    WEB_SRC / "ui-refresh.css",
    WEB_SRC / "production-polish.css",
)


def hex_rgb(value):
    value = value.lstrip("#")
    if len(value) in (3, 4):
        value = "".join(ch * 2 for ch in value[:3])
    elif len(value) in (6, 8):
        value = value[:6]
    else:
        return None
    return tuple(int(value[i:i + 2], 16) / 255 for i in (0, 2, 4))


class WebVisualPolishTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.styles = "\n".join(path.read_text(encoding="utf-8") for path in STYLE_FILES)

    def test_refresh_styles_use_flat_non_purple_palette(self):
        self.assertNotRegex(self.styles, re.compile(r"\b(?:purple|violet|magenta)\b", re.IGNORECASE))
        self.assertNotRegex(self.styles, re.compile(r"(?:linear|radial|conic)-gradient\s*\(", re.IGNORECASE))
        self.assertNotRegex(self.styles, re.compile(r"backdrop-filter\s*:", re.IGNORECASE))
        for removed_plum in ("#3a202b", "#3a222a", "#2c2028", "#3c252d", "#3a252d"):
            self.assertNotIn(removed_plum, self.styles.casefold())

        purple_colors = []
        for match in re.finditer(r"#([0-9a-fA-F]{3,8})\b", self.styles):
            rgb = hex_rgb(match.group(0))
            if rgb is None:
                continue
            hue, saturation, _value = colorsys.rgb_to_hsv(*rgb)
            degrees = hue * 360
            if 250 <= degrees <= 340 and saturation >= 0.18:
                purple_colors.append(match.group(0))
        self.assertEqual(purple_colors, [], f"Purple-family colors found: {purple_colors}")

    def test_refresh_styles_preserve_dark_mode_responsive_layout_and_reduced_motion(self):
        self.assertIn('html[data-theme="dark"]', self.styles)
        self.assertRegex(self.styles, r"@media\s*\([^)]*max-width")
        self.assertIn("prefers-reduced-motion:reduce", self.styles)
        self.assertIn(":focus-visible", self.styles)

    def test_refresh_layer_is_loaded_after_existing_production_design_system(self):
        main = (WEB_SRC / "main.tsx").read_text(encoding="utf-8")
        imports = (
            'import "../production.css";',
            'import "./ui-refresh.css";',
            'import "./production-polish.css";',
        )
        positions = [main.index(item) for item in imports]
        self.assertEqual(positions, sorted(positions))

    def test_staff_facing_workspace_copy_does_not_expose_branch_administration_terms(self):
        paths = (
            WEB_SRC / "components" / "StaffWorkspace.tsx",
            WEB_SRC / "components" / "OperationsWorkspace.tsx",
            WEB_SRC / "components" / "TeamAdministrationWorkspace.tsx",
            WEB_SRC / "components" / "MinistryReportsWorkspace.tsx",
        )
        source = "\n".join(path.read_text(encoding="utf-8") for path in paths)
        visible_terms = (
            "No active branch access",
            "Branch teams",
            "No event drafts are visible in this branch",
            "No event options are available for this branch",
            "branch time zone",
            "branch administrator",
        )
        for term in visible_terms:
            self.assertNotIn(term.casefold(), source.casefold(), term)


if __name__ == "__main__":
    unittest.main()

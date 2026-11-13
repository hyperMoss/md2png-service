# OPPOSans font assets

The unmodified WOFF2 files come from [zhaoolee/notes](https://github.com/zhaoolee/notes/tree/416035cdccd0226aa94f045e8474b45bfd533961/src/assets/fonts) at commit `416035cdccd0226aa94f045e8474b45bfd533961`. File sizes, upstream Git blob hashes, and SHA-256 checksums are recorded in [sources.json](sources.json).

| File | CSS weight | Embedded font version |
| --- | --- | --- |
| `OPPOSans-R.woff2` | 400 | 1.00 |
| `OPPOSans-M.woff2` | 500 | 1.00 |
| `OPPOSans-B.woff2` | 700 | 1.00 |

The font files retain their embedded copyright notices: copyright 2019 OPPO. All rights reserved. The fonts are third-party assets and are not relicensed under this project's Apache-2.0 license.

OPPO's [official font announcement](https://www.coloros.com/article/A00000050/) confirms free personal and commercial use, including the 2019 release, and states restrictions on modification, selling fonts, providing alternative download channels, and unlawful use. The [current official font page](https://www.coloros.com/article/A00000074/) provides the official download and terms. Those pages describe newer releases; the bundled files identify themselves as version 1.00 and contain no separate embedded license text. This project does not grant additional rights to distribute the font files.

The renderer embeds the local files as data URLs for offline browser rendering. It waits for fonts before measuring page height. It exposes generated PNG files, without a font-download endpoint. System font preferences remain in the theme stacks; OPPOSans provides the bundled fallback where native fonts are unavailable.

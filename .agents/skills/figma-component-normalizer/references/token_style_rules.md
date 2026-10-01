# NearHub token and style rules

Use these rules when normalizing NearHub marketing/homepage Figma modules.

The goal is to bind existing semantic tokens/styles, not create new ones.

## Color tokens

### Neutral and content

| Semantic name | Value | Usage |
| --- | --- | --- |
| content-primary | #222222 | Primary black: headings and main body text |
| content-secondary | #555555 | Secondary body text and form helper copy |
| content-tertiary | #999999 | Auxiliary text, placeholders, disabled text |
| content-white | #FFFFFF | Primary text on dark/colored backgrounds |
| content-white-70 | rgba(255,255,255,0.7) | Secondary text on dark/colored backgrounds |
| content-white-40 | rgba(255,255,255,0.4) | Weak auxiliary text |
| surface | #FFFFFF | Page/card/container background |
| surface-subdued | #F8F8F8 | Light section background |
| border-base | #E5E5E5 | Standard dividers and strokes |

### Brand

| Semantic name | Value | Usage |
| --- | --- | --- |
| primary | #3D6DFF | Main brand blue |
| primary-hover | #6691FF | Hover state |
| primary-active | #294FD9 | Active/pressed state |
| primary-disabled | rgba(61,109,255,0.3) | Disabled state |
| primary-border | rgba(61,109,255,0.2) | Primary border |
| primary-bg | rgba(61,109,255,0.05) | Light primary background |
| orange | #FF703D | Brand orange accent |
| teal | #2EC4B0 | Secondary accent / success |

## Typography styles

All typography uses Inter.

| Style | Size | Weight | Line height | Usage |
| --- | --- | --- | --- | --- |
| text-display-1 | 44px | 700 | 1.27 | Homepage hero title |
| text-display-2 | 40px | 700 | 1.30 | Landing hero title |
| text-heading-1 | 40px | 700 | 1.30 | Large module title |
| text-heading-2 | 24px | 700 | 1.33 | Secondary heading |
| text-heading-3 | 20px | 500 | 1.40 | Module title |
| text-heading-4 | 16px | 500 | 1.50 | Small module title |
| text-title-1 | 24px | 700 | 1.33 | Card title |
| text-title-2 | 18px | 700 | 1.55 | List item title |
| text-title-3 | 16px | 600 | 1.50 | Section content title |
| text-title-4 | 16px | 500 | 1.50 | Auxiliary title |
| text-body-1 | 20px | 700 | 1.40 | Emphasized paragraph |
| text-body-2 | 16px | 400 | 1.50 | Standard body |
| text-body-3 | 14px | 400 | 1.43 | Secondary body |
| text-label-1 | 20px | 500 | 1.40 | Menu item |
| text-label-2 | 16px | 600 | 1.50 | Large button / tab |
| text-label-3 | 16px | 500 | 1.50 | Medium button |
| text-label-4 | 14px | 500 | 1.42 | Form label |
| text-label-5 | 12px | 500 | 1.33 | Small label |
| text-caption-1 | 12px | 400 | 1.33 | Caption / copyright |

## Enforcement

- Prefer semantic names over raw values.
- Replace old `gray-*`, `.h1`, `.pargh` usage when detected.
- Preserve appearance unless user explicitly asks for redesign.
- Bind existing Figma variables/styles when available.
- If missing, preserve raw value and report the missing token/style.
- Do not create new tokens by default.

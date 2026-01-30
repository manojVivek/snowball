# Snowball - Dividend Reinvestment App

## Development Guidelines

**IMPORTANT: Do not run `npm run build` for every change.** Instead, use:

- `npm run lint` - For linting checks
- `npx tsc --noEmit` - For TypeScript type checking

Only run full build when preparing for deployment or when specifically requested.

## Responsive Design

**IMPORTANT: All new code must be responsive for both mobile and desktop.**

Follow these responsive design patterns:

### Breakpoint Usage

- Use Tailwind's responsive prefixes: `sm:`, `md:`, `lg:`
- Mobile-first approach: base styles for mobile, then add larger breakpoint overrides
- Key breakpoints: `sm:` (640px), `md:` (768px), `lg:` (1024px)

### Common Patterns

- **Spacing**: Use `py-4 sm:py-6` or `p-4 sm:p-6` for responsive padding
- **Typography**: Use `text-sm sm:text-base` or `text-xs sm:text-sm` for responsive text
- **Layouts**: Use `flex-col sm:flex-row` for stacked-to-horizontal layouts
- **Tables**: Hide less important columns on mobile with `hidden sm:table-cell` or `hidden md:table-cell`
- **Containers**: Already responsive via `Container` component

### Testing

- Always test on mobile viewport (375px) and desktop (1024px+)
- Tables should have `overflow-x-auto` for horizontal scrolling on mobile
- Touch targets should be at least 44px on mobile

## UI Guidelines

**IMPORTANT: All UI elements must use components from the Oatmeal template only.**

Do NOT use raw HTML elements like `<select>`, `<input>`, `<button>` directly. Always use the corresponding template components from `src/components/elements/`:

| Raw HTML        | Template Component                                                        |
| --------------- | ------------------------------------------------------------------------- |
| `<button>`      | `Button`, `SoftButton`, `PlainButton` from `@/components/elements/button` |
| `<select>`      | `Select`, `SoftSelect` from `@/components/elements/select`                |
| `<p>`, `<span>` | `Text` from `@/components/elements/text`                                  |
| `<h1>`, `<h2>`  | `Heading` from `@/components/elements/heading`                            |
| `<h3>`, `<h4>`  | `Subheading` from `@/components/elements/subheading`                      |
| Labels          | `Eyebrow` from `@/components/elements/eyebrow`                            |

### Available Template Components

**Elements** (`src/components/elements/`):

- `button.tsx` - Button, SoftButton, PlainButton, ButtonLink variants
- `select.tsx` - Select, SoftSelect for dropdowns
- `container.tsx` - Layout wrapper
- `heading.tsx` - Main headings
- `subheading.tsx` - Section headings
- `text.tsx` - Body text
- `eyebrow.tsx` - Small labels
- `section.tsx` - Content sections
- `main.tsx` - Main content wrapper

**Sections** (`src/components/sections/`):

- `hero-simple-centered.tsx` - Hero section
- `stats-four-columns.tsx` - Statistics display

**Icons** (`src/components/icons/`):

- Various icons matching the template style

## Template Reference

When a new UI component is needed, refer to the Oatmeal template for design and structure. The Oatmeal template source files are located at `/template/`. When in doubt about component styling or structure, refer to the original template files:

- `/template/components/` - Core component implementations
- `/template/demo/` - Demo pages and usage examples
- `/template/demo/src/app/home-03/` - Main reference for homepage layout

### Color Palette

Use the `olive` color palette defined in `tailwind.config.ts`:

- Primary text: `text-olive-950` (light) / `text-white` (dark)
- Secondary text: `text-olive-700` / `text-olive-400`
- Backgrounds: `bg-olive-100` / `bg-olive-950`
- Borders: `border-olive-950/5` / `border-white/5`

## Architecture

The app uses a modular multi-broker architecture:

### Parsers (`src/lib/parsers/`)

- `types.ts` - `DividendParser` interface
- `registry.ts` - Parser registry
- `brokers/` - Broker-specific parsers (e.g., `zerodha.ts`)

### Exporters (`src/lib/exporters/`)

- `types.ts` - `BasketExporter` interface
- `registry.ts` - Exporter registry
- `brokers/` - Broker-specific exporters (e.g., `kite.ts`)

### Adding New Brokers

1. Create parser in `src/lib/parsers/brokers/<broker>.ts`
2. Create exporter in `src/lib/exporters/brokers/<broker>.ts`
3. Register in respective `registry.ts` files

The UI automatically picks up new brokers from the registries.

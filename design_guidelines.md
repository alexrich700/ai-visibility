# AI Visibility Audit Tool - Design Guidelines

## Design Preservation Requirement
**CRITICAL**: User has provided existing UI code with explicit instruction to "keep the colors, fonts, styles, layout, and everything right." All design decisions must preserve the established aesthetic.

## Brand Identity

### Logo & Branding
- **Company Name**: Motivent Marketing
- **Logo**: Orange/yellow abstract geometric design (8x8 rounded square)
- **Typography**: Montserrat font family, bold weight

### Brand Color Palette
```
Primary Orange: #ff5800 (Willpower Orange)
Destructive Red: #ff0006 (Tech Red)
Accent Yellow: #ffb41c
Black: #010400
White: #fff
Gray Scale: gray-50, gray-100, gray-200, gray-400, gray-500
```

## Typography System
- **Font Family**: Montserrat (primary), system sans-serif fallback
- **Headings**: Bold, ultra-tight tracking (`tracking-tighter`)
- **H1**: 5xl to 7xl, bold weight
- **Body**: Light to medium weights for hierarchy
- **Labels**: Uppercase, xs size, bold, wide tracking (`tracking-wider`)
- **Monospace**: For technical/prompt displays

## Layout Structure

### Spacing System
Use Tailwind's standard spacing: `p-4, p-6, p-8` for padding; `gap-2, gap-3, gap-4` for gaps; `space-y-4, space-y-6, space-y-10` for vertical rhythm

### Component Architecture

**Cards**
- White background, rounded-xl borders
- Border: 1px gray-200
- Shadow: `shadow-2xl shadow-blue-900/5` for elevated cards

**Badges**
- Rounded-md, uppercase, xs text, bold
- 3px horizontal padding, 1px vertical
- Types: neutral (gray), success (orange), warning (yellow), danger (white/red border)

**Buttons**
- Primary: Orange background (#ff5800), hover darker (#e04f00), white text, bold
- Full rounded-xl corners, py-4 padding
- Orange shadow on hover: `shadow-lg shadow-orange-500/20`
- Icons paired with arrow-right

**Input Fields**
- Background: gray-50
- Border: gray-200, focus shifts to orange with ring
- Rounded-lg corners, pl-12 for icon space
- Icon positioning: absolute left-3, gray-400, transitions to orange on focus

### Page Sections

**Header**
- Clean, minimal: Logo left, "Client Login" right
- Padding: px-6 py-8
- Max-width container: 7xl

**Hero Section**
- Centered content, max-width 3xl
- Large headline (5xl-7xl), tight tracking
- Lighter subheading (xl-2xl, gray-500, font-light)
- Generous vertical spacing (space-y-6, space-y-10)

**Form Container**
- Tab navigation at top (border-b design)
- Active tab: gray-50 background, orange bottom border (2px)
- Input grid: md:grid-cols-2 for side-by-side fields
- Grouped inputs with icon prefixes

**Scanning Interface**
- Centered loader with progress indicator
- Dynamic status text with subtitle
- Monospace font for technical details
- Animated loading states

**Results Display**
- List layout with border-b separators
- Icon status indicators (checkmark/x)
- Prompt in quotes, large font (text-lg)
- Color-coded detail text (green success, red failure)

**Modal Overlays**
- Full-screen backdrop: `bg-[#010400]/80` with blur
- White rounded-2xl container, max-w-lg
- Orange header section with icon
- Form in white section below
- X button: absolute top-right

## Interaction Patterns

**Transitions**
- Use `transition-all` or `transition-colors`
- Subtle hover states: opacity or background changes
- Focus states: border color shift to orange with ring

**Animations**
- Fade-in/zoom-in for modals: `animate-in fade-in zoom-in-95`
- Progress animations for scanning
- Minimal, purposeful motion

## Component Styling Patterns

**Focus States**
- Orange ring and border on form inputs
- Group focus-within for icon color transitions

**Icon Treatment**
- Size 16-20 for inline, 24+ for standalone
- Gray-400 default, orange on active/focus
- Lucide React icon library

**Selection**
- Custom selection colors: `selection:bg-[#ff5800] selection:text-white`

## Accessibility
- Proper focus indicators with orange rings
- Icon + text pairings for clarity
- High contrast text (black on white primary)
- Required field validation

## Visual Hierarchy
- Bold headlines with light supporting text
- Icon-first input design
- Color as accent, not primary communication
- Generous whitespace for breathing room

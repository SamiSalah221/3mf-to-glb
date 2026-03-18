# 3MF-to-GLB Color Customizer

A fully client-side web application that parses multi-color 3MF files (the native format of Bambu Studio and modern slicers), extracts per-face color data, renders an interactive 3D preview, and exports production-ready GLB files. Zero server dependencies — everything runs in the browser.

## Key Technical Challenges Solved

### Reverse-Engineering BambuStudio's `paint_color` Encoding
BambuStudio stores per-face filament assignments in a proprietary binary format: a nibble-packed recursive triangle subdivision tree, read right-to-left, with extended state overflow handling for 16+ extruders. No public documentation exists for this format. I reverse-engineered it from hex dumps and implemented a correct TypeScript decoder.

### Z-Plane Triangle Clipping
Supports layer-height-based color changes (MultiAsSingle mode) by implementing Z-plane triangle clipping with progressive boundary splitting. This converts G-code tool-change metadata into geometry-level color zones without requiring a slicer application.

### 3MF → glTF Material Pipeline
Complete format conversion pipeline handling:
- ZIP/OPC archive parsing via JSZip
- XML correlation across model geometry, `model_settings.config`, `project_settings.config`, and `custom_gcode_per_layer.xml`
- Affine transform composition across multiple coordinate spaces
- sRGB-to-linear color space conversion
- Per-zone PBR material generation via @gltf-transform/core

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Language | TypeScript |
| Frontend | React, Vite |
| 3D Rendering | Three.js, React Three Fiber |
| State | Zustand |
| File Processing | JSZip, @gltf-transform/core |
| Color Science | sRGB ↔ Linear conversion, PBR materials |

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐     ┌──────────┐
│  Upload 3MF  │────▶│  Parse OPC   │────▶│  Decode Colors   │────▶│  Render  │
│  (ZIP file)  │     │  + XML Files │     │  + Clip Geometry  │     │  3D View │
└─────────────┘     └──────────────┘     └─────────────────┘     └──────────┘
                                                                       │
                                                                       ▼
                                                                 ┌──────────────┐
                                                                 │  Export GLB   │
                                                                 │  (download)   │
                                                                 └──────────────┘
```

## Project Structure

```
src/
├── lib/              # Core parsing and conversion logic
│   ├── parse3MF.ts           # 3MF ZIP/XML parsing + color extraction
│   ├── colorConvert.ts       # sRGB ↔ linear color space conversion
│   ├── glbBuilder.ts         # Geometry → glTF document construction
│   └── glbExporter.ts        # GLB binary export
├── components/       # React UI
│   ├── UploadScreen.tsx      # File upload dropzone
│   ├── EditorScreen.tsx      # Main editor layout
│   ├── ColorPicker.tsx       # Per-zone color selector
│   ├── ZonePanel.tsx         # Color zone list + controls
│   ├── ExportButton.tsx      # GLB download trigger
│   └── LoadingScreen.tsx     # Processing indicator
├── viewer/           # Three.js 3D preview
├── store/            # Zustand state management
├── types/            # TypeScript type definitions
└── styles/           # CSS
```

## Running Locally

```bash
git clone https://github.com/SamiSalah221/3mf-to-glb.git
cd 3mf-to-glb
npm install
npm run dev
```

## License

MIT

# 3MF Color Resolution in Bambu Studio: Complete Technical Specification

## Table of Contents
1. [3MF Core Spec: Color Assignment System](#1-3mf-core-spec-color-assignment-system)
2. [3MF Materials Extension: ColorGroups](#2-3mf-materials-extension-colorgroups)
3. [Bambu Studio Specific Format](#3-bambu-studio-specific-format)
4. [Multi-File 3MF (Production Extension)](#4-multi-file-3mf-production-extension)
5. [Color Resolution Priority](#5-color-resolution-priority)
6. [paint_color Encoding Deep Dive](#6-paint_color-encoding-deep-dive)
7. [Three.js ThreeMFLoader Behavior](#7-threejs-threemfloader-behavior)
8. [Known Issues and Edge Cases](#8-known-issues-and-edge-cases)
9. [Practical Implications for Our Parser](#9-practical-implications-for-our-parser)

---

## 1. 3MF Core Spec: Color Assignment System

### 1.1 Triangle Element Attributes

Every triangle in a 3MF mesh can carry color/material properties via these attributes:

```xml
<triangle v1="0" v2="1" v3="2" pid="5" p1="0" p2="1" p3="2" />
```

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `v1`, `v2`, `v3` | ST_ResourceIndex | Yes | Zero-based vertex indices (CCW winding for outward normal) |
| `pid` | ST_ResourceID | No | Overrides object-level `pid` — references a property group (basematerials, colorgroup, etc.) |
| `p1` | ST_ResourceIndex | No | Property index for vertex v1, overrides object-level `pindex` |
| `p2` | ST_ResourceIndex | No | Property index for vertex v2 (defaults to p1 if unspecified) |
| `p3` | ST_ResourceIndex | No | Property index for vertex v3 (defaults to p1 if unspecified) |

### 1.2 Object Element Properties

```xml
<object id="1" type="model" pid="5" pindex="0">
```

- `pid`: References a property group element (basematerials, colorgroup) by its `id`
- `pindex`: Zero-based index into the property group referenced by `pid`
- These serve as **defaults** for all triangles in the mesh

### 1.3 BaseMaterials Resource

```xml
<basematerials id="5">
  <base name="White PLA" displaycolor="#FFFFFFFF" />
  <base name="Black PLA" displaycolor="#161616FF" />
  <base name="Blue PLA"  displaycolor="#0078BFFF" />
</basematerials>
```

- `displaycolor` is sRGB format: `#RRGGBB` or `#RRGGBBAA`
- Each `<base>` has an implicit 0-based index (0, 1, 2, ...)
- **Critical constraint**: When pid references basematerials, p1=p2=p3 MUST be equal (no gradients allowed for base materials)

### 1.4 Property Resolution Cascade

The spec defines a strict resolution hierarchy:

1. **Triangle-level `pid`** overrides object-level `pid` (applies to entire triangle)
2. **Triangle-level `p1`** overrides object-level `pindex` for vertex v1
3. If `p2` is unspecified, it defaults to `p1` (entire triangle gets p1's color)
4. If `p3` is unspecified, it defaults to `p1`
5. If `p1` is unspecified, the object-level `pindex` is used
6. If no object-level `pid`/`pindex`, the triangle has no material assigned

---

## 2. 3MF Materials Extension: ColorGroups

### 2.1 ColorGroup Element

```xml
<m:colorgroup id="8" xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
  <m:color color="#FF0000FF" />
  <m:color color="#00FF00FF" />
  <m:color color="#0000FFFF" />
</m:colorgroup>
```

- Colors are implicit 0-based indexed
- When `pid` on a triangle references a colorgroup, `p1`/`p2`/`p3` can differ (color gradients supported)
- **Color gradients**: Interpolated in sRGB space using barycentric coordinates

### 2.2 Color Space and Conversion

Colors in 3MF are **sRGB**. For glTF/GLB export, you must convert to **linear sRGB**:

```
For C_sRGB <= 0.04045:  C_linear = C_sRGB / 12.92
For C_sRGB > 0.04045:   C_linear = ((C_sRGB + 0.055) / 1.055) ^ 2.4
```

### 2.3 MultiProperties and CompositeMaterials

- **CompositeMaterials**: Mix base materials in defined ratios
- **MultiProperties**: Layer multiple property types with blend modes ("mix" or "multiply")
  - Materials must be first layer
  - Colors/textures in subsequent layers
  - Blending performed in **linear RGB space**

### 2.4 Tex2DGroup (Texture Mapping)

```xml
<m:texture2dgroup id="10" texid="1">
  <m:tex2coord u="0.0" v="0.0" />
  <m:tex2coord u="1.0" v="0.0" />
  <m:tex2coord u="0.5" v="1.0" />
</m:texture2dgroup>
```

UV coordinates: (0,0) = bottom-left, (1,1) = top-right.

---

## 3. Bambu Studio Specific Format

### CRITICAL: Bambu Studio Does NOT Use Standard pid/p1/p2/p3 for Color

**This is the most important finding.** Bambu Studio (and its parent PrusaSlicer) **ignores** the standard 3MF `pid`/`p1`/`p2`/`p3` attributes when importing, and does NOT write them when exporting. Instead, it uses a completely proprietary system based on:

1. **Per-object/per-volume `extruder` metadata** in `model_settings.config`
2. **Per-triangle `paint_color` attribute** for MMU-painted faces
3. **Filament colors** stored in `project_settings.config`

### 3.1 Package Structure

A Bambu Studio 3MF is a ZIP archive containing:

```
/
├── [Content_Types].xml
├── _rels/.rels
├── 3D/
│   ├── 3dmodel.model              (root model - components only, no mesh data)
│   ├── _rels/3dmodel.model.rels   (references to sub-model files)
│   └── Objects/
│       ├── object_5.model         (actual mesh data per-object)
│       ├── object_6.model
│       └── ...
├── Metadata/
│   ├── model_settings.config      (object/volume/plate configuration)
│   ├── project_settings.config    (JSON: filament colors, slicer settings)
│   ├── slice_info.config          (slice statistics)
│   ├── filament_sequence.json     (per-plate filament order)
│   ├── cut_information.xml        (cut plane data)
│   ├── plate_1.png                (plate thumbnails)
│   └── ...
```

### 3.2 Root Model File (3D/3dmodel.model)

The root model contains **no mesh geometry**. It only has component-based objects referencing sub-model files:

```xml
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
       xmlns:BambuStudio="http://schemas.bambulab.com/package/2021"
       xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06"
       requiredextensions="p">

 <resources>
  <!-- Single-part object: one component pointing to one sub-model -->
  <object id="2" p:UUID="..." type="model">
   <components>
    <component p:path="/3D/Objects/object_5.model" objectid="1"
               p:UUID="..." transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
   </components>
  </object>

  <!-- Multi-part object: multiple components, possibly from different sub-models -->
  <object id="16" p:UUID="..." type="model">
   <components>
    <component p:path="/3D/Objects/object_38.model" objectid="13" .../>
    <component p:path="/3D/Objects/object_38.model" objectid="14" ...
               transform="-0.724 ... 31.22 1.47 -6.78"/>
    <component p:path="/3D/Objects/object_38.model" objectid="15" ...
               transform="-0.459 ... -14.42 102.0 0.69"/>
   </components>
  </object>
 </resources>

 <build p:UUID="...">
  <item objectid="2" transform="1 0 0 0 1 0 0 0 1 235.95 75.16 5" printable="1"/>
  <item objectid="16" transform="1 0 0 0 1 0 0 0 1 154.56 -179.35 12.5" printable="1"/>
 </build>
</model>
```

### 3.3 Sub-Model Files (3D/Objects/*.model)

Each sub-model contains the actual mesh geometry with vertices and triangles. Triangles may carry the proprietary `paint_color` attribute:

```xml
<object id="1" p:UUID="..." type="model">
 <mesh>
  <vertices>
   <vertex x="2.237" y="-0.243" z="-4"/>
   ...
  </vertices>
  <triangles>
   <triangle v1="0" v2="1" v3="2" paint_color="8"/>
   <triangle v1="3" v2="4" v3="5"/>
   <triangle v1="6" v2="7" v3="8" paint_color="0C"/>
   <triangle v1="9" v2="10" v3="11" paint_color="0C0C80C0C30C0C3"/>
  </triangles>
 </mesh>
</object>
```

**Note**: No `pid`, `p1`, `p2`, `p3` attributes. No `<basematerials>` or `<colorgroup>` resources in the XML.

### 3.4 Model Settings Config (Metadata/model_settings.config)

This is the primary configuration file for object/volume/plate mapping:

```xml
<config>
  <!-- Object definition -->
  <object id="16">
    <metadata key="name" value="Assembly"/>
    <metadata key="extruder" value="2"/>          <!-- DEFAULT extruder for this object -->
    <metadata face_count="119852"/>

    <!-- Part (volume) definitions -->
    <part id="13" subtype="normal_part">
      <metadata key="name" value="Assembly"/>
      <metadata key="matrix" value="1 0 0 82.15 0 1 0 -4.24 0 0 1 0 0 0 0 1"/>
      <metadata key="source_file" value=".3mf"/>
      <metadata key="source_object_id" value="7"/>
      <metadata key="source_volume_id" value="0"/>
      <metadata key="source_offset_x" value="0"/>
      <metadata key="source_offset_y" value="0"/>
      <metadata key="source_offset_z" value="0"/>
      <mesh_stat face_count="5268" .../>
    </part>

    <part id="14" subtype="normal_part">
      <metadata key="name" value="alhamdulilah.3mf"/>
      <metadata key="extruder" value="1"/>         <!-- OVERRIDE: this part uses extruder 1 -->
      <mesh_stat face_count="114584" .../>
    </part>

    <part id="15" subtype="negative_part">          <!-- NEGATIVE VOLUME: subtracted from geometry -->
      <metadata key="name" value="logo.3mf"/>
      <metadata key="extruder" value="1"/>
      <mesh_stat face_count="89120" .../>
    </part>
  </object>

  <!-- Plate definitions -->
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value=""/>
    <metadata key="locked" value="false"/>
    <metadata key="filament_map_mode" value="Auto For Flush"/>
    <metadata key="filament_maps" value="1 1 1 1"/>
    <metadata key="filament_volume_maps" value="0 0 0 0"/>
    <metadata key="thumbnail_file" value="Metadata/plate_1.png"/>
    <model_instance>
      <metadata key="object_id" value="2"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="37065"/>
    </model_instance>
    <model_instance>
      <metadata key="object_id" value="21"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="37172"/>
    </model_instance>
  </plate>

  <!-- Assembly view positions -->
  <assemble>
   <assemble_item object_id="8" instance_id="0"
                  transform="1 0 0 0 1 0 0 0 1 571.37 0 4" offset="0 0 0"/>
  </assemble>
</config>
```

### 3.5 Key Fields in model_settings.config

#### Object-Level Metadata
| Key | Description |
|-----|-------------|
| `name` | Display name of the object |
| `extruder` | **Default extruder index (1-based)** for all parts in this object |
| `face_count` | Total face count (informational) |

#### Part-Level Metadata
| Key | Description |
|-----|-------------|
| `name` | Display name of the part/volume |
| `extruder` | **Override extruder index (1-based)** for this specific part. If absent, inherits from object |
| `matrix` | 4x4 transformation matrix (row-major, 16 values) |
| `source_file` | Original filename this geometry came from |
| `source_object_id` | Object ID in the source file |
| `source_volume_id` | Volume ID in the source file |

#### Part Subtypes
| Subtype | `ModelVolumeType` | Description |
|---------|-------------------|-------------|
| `normal_part` | `MODEL_PART` (0) | Regular printable geometry |
| `negative_part` | `NEGATIVE_VOLUME` (1) | Boolean-subtracted from parent object |
| `modifier_part` | `PARAMETER_MODIFIER` (2) | Modifies settings in a region |
| `support_blocker` | `SUPPORT_BLOCKER` (3) | Blocks support generation |
| `support_enforcer` | `SUPPORT_ENFORCER` (4) | Forces support generation |

### 3.6 Project Settings Config (Metadata/project_settings.config)

This is a **JSON file** containing ALL slicer settings. Key color-related fields:

```json
{
  "filament_colour": ["#FFF144", "#161616", "#FFFFFF", "#0078BF"],
  "filament_type": ["PLA", "PLA", "PLA", "PLA"],
  "filament_vendor": ["Generic", "INLAND", "SUNLU", "Bambu Lab"],
  "filament_settings_id": ["Generic PLA Silk @BBL A1", "INLAND PLA Basic...", ...],
  "filament_ids": ["GFL96", "Pa973b41", "GFSNL03", "GFA01"],
  "default_filament_colour": ["", "", "", ""],
  "filament_multi_colour": ["#FFF144", "#161616", "#FFFFFF", "#0078BF"],
  "extruder_colour": ["#018001"],
  "filament_map": ["1", "1", "1", "1"],
  "filament_map_mode": "Auto For Flush",
  "filament_nozzle_map": ["1", "0", "0", "0"],
  "single_extruder_multi_material": 1,
  "master_extruder_id": 1
}
```

#### Filament Color Arrays

**These arrays are 0-indexed** but the **extruder values in model_settings.config are 1-indexed**.

| Field | Description |
|-------|-------------|
| `filament_colour` | **PRIMARY**: Hex color per filament slot. Array index = filament slot index (0-based) |
| `filament_multi_colour` | Same as filament_colour (used for multi-color filaments) |
| `default_filament_colour` | Factory default colors (often empty strings) |
| `extruder_colour` | Color of the extruder hardware itself (not filament) |
| `filament_type` | Material type per slot ("PLA", "PETG", "ABS", etc.) |

#### Extruder-to-Filament Mapping

- `extruder` value `1` in model_settings → `filament_colour[0]` (#FFF144 = yellow)
- `extruder` value `2` → `filament_colour[1]` (#161616 = black)
- `extruder` value `3` → `filament_colour[2]` (#FFFFFF = white)
- `extruder` value `4` → `filament_colour[3]` (#0078BF = blue)

**Formula: `filament_colour[extruder_value - 1]`**

### 3.7 Plate Configuration

#### Plate Fields
| Field | Description |
|-------|-------------|
| `plater_id` | 1-based plate index |
| `plater_name` | User-assigned plate name |
| `locked` | Whether plate is locked from auto-arrangement |
| `filament_map_mode` | Mapping strategy: `"Auto For Flush"`, `"Manual"`, etc. |
| `filament_maps` | Space-separated list: remapped filament indices per slot for this plate |
| `filament_volume_maps` | Space-separated volume-based filament mapping |

#### filament_maps Explained

`filament_maps="1 1 1 1"` means: on this plate, all 4 filament slots map to filament slot 1. This is a **per-plate filament remapping** feature that allows different plates to use different physical filament assignments.

When `filament_maps="1 2 3 4"` (identity mapping), each extruder uses its own filament slot directly.

#### model_instance Within Plates

```xml
<model_instance>
  <metadata key="object_id" value="2"/>      <!-- References object id in root model -->
  <metadata key="instance_id" value="0"/>    <!-- Which instance of this object -->
  <metadata key="identify_id" value="37065"/><!-- Unique tracking ID -->
</model_instance>
```

### 3.8 Negative Parts (subtype="negative_part")

Negative parts are volumes that are **boolean-subtracted** from the parent object's geometry. In the real file:

```xml
<part id="15" subtype="negative_part">
  <metadata key="name" value="logo.3mf"/>
  <metadata key="extruder" value="1"/>
</part>
```

- The mesh geometry of a negative part defines a void/cutout
- The `extruder` value on a negative part is still relevant: it determines which filament fills the void if the negative part doesn't go all the way through
- Bambu Studio performs the boolean subtraction at slice time, not in the 3MF geometry

---

## 4. Multi-File 3MF (Production Extension)

### 4.1 The p:path Attribute

From the 3MF Production Extension specification:

```xml
<component p:path="/3D/Objects/object_38.model" objectid="13" p:UUID="..." transform="..."/>
```

- `p:path` is an **absolute path within the ZIP** to a sub-model file
- The `objectid` references an `<object>` element **within that sub-model file** (not the root model)
- `p:path` can ONLY be used in the **root model file** — sub-model files cannot cross-reference other sub-models
- Resources (textures, materials) must come from the **referenced file**, not the root

### 4.2 Relationship Discovery

Sub-models are listed in `3D/_rels/3dmodel.model.rels`:

```xml
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/Objects/object_5.model" Id="rel-1"
               Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
 <Relationship Target="/3D/Objects/object_6.model" Id="rel-2"
               Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>
```

### 4.3 Object ID Resolution

To resolve a component reference:
1. Read `p:path` → find the sub-model file in the ZIP
2. Read `objectid` → find the `<object>` with that `id` in the sub-model
3. That object's mesh is the geometry for this component
4. Apply the `transform` matrix from the component element

### 4.4 Real-World Example from Our File

Root model object id=16 has 3 components:
```
component p:path="/3D/Objects/object_38.model" objectid="13" → main body mesh
component p:path="/3D/Objects/object_38.model" objectid="14" → calligraphy (scaled, repositioned)
component p:path="/3D/Objects/object_38.model" objectid="15" → logo cutout (negative part)
```

All three reference the same sub-model file but different objects within it. The model_settings.config tells us objectid=13 inherits extruder=2 (black), objectid=14 overrides to extruder=1 (yellow), and objectid=15 is a negative_part with extruder=1.

---

## 5. Color Resolution Priority

### 5.1 For Standard 3MF Viewers/Parsers

If a file follows the 3MF spec properly:
1. Triangle-level `pid`/`p1`/`p2`/`p3` → highest priority
2. Object-level `pid`/`pindex` → fallback default
3. No properties → no color (use viewer default)

### 5.2 For Bambu Studio 3MF Files (Our Case)

Bambu Studio files **do not use** standard `pid`/`p1`/`p2`/`p3`. The resolution chain is:

```
Priority 1: paint_color attribute on triangle
             → Decode hex string → get EnforcerBlockerType → map to extruder index
             → extruder_index → filament_colour[extruder_index - 1]

Priority 2: Part-level extruder override in model_settings.config
             → <part id="14"><metadata key="extruder" value="1"/>
             → filament_colour[0]

Priority 3: Object-level extruder default in model_settings.config
             → <object id="16"><metadata key="extruder" value="2"/>
             → filament_colour[1]

Priority 4: Plate-level filament_maps remapping (only affects slicing, not color display)

Priority 5: Default filament (extruder 1 / filament_colour[0])
```

### 5.3 Color Resolution Algorithm

```
function resolveTriangleColor(triangle, partId, objectId):
    // Step 1: Check per-triangle paint_color
    if triangle.paint_color exists:
        extruderType = decodePaintColor(triangle.paint_color)
        if extruderType != NONE:
            return filament_colour[extruderType - 1]  // EnforcerBlockerType.Extruder1 = 1

    // Step 2: Check part-level extruder
    partConfig = model_settings.config.parts[partId]
    if partConfig.extruder exists:
        return filament_colour[partConfig.extruder - 1]

    // Step 3: Check object-level extruder
    objectConfig = model_settings.config.objects[objectId]
    if objectConfig.extruder exists:
        return filament_colour[objectConfig.extruder - 1]

    // Step 4: Default
    return filament_colour[0]
```

---

## 6. paint_color Encoding Deep Dive

### 6.1 Overview

The `paint_color` attribute is a **hex string** encoding a binary tree of triangle subdivisions. It comes from `FacetsAnnotation::get_triangle_as_string()` in Bambu Studio's source code.

### 6.2 Encoding Format

The data is a sequence of **4-bit nibbles**, stored as hex characters (0-9, A-F). The string is read **right-to-left** (reversed during serialization).

Each nibble is split into two 2-bit fields: `xxyy`
- `yy` (bits 0-1): number of split sides (0 = leaf, 1-3 = subdivided)
- `xx` (bits 2-3): depends on context:
  - If leaf (`yy=0`): `xx` = EnforcerBlockerType value (0-2)
  - If leaf and `xx=3` (value 0b11): extended encoding follows (additional nibble(s) for values >= 3)
  - If non-leaf (`yy>0`): `xx` = special side index

### 6.3 EnforcerBlockerType Values

From `Model.hpp`:

```cpp
enum class EnforcerBlockerType : int8_t {
    NONE      = 0,
    ENFORCER  = 1,    // Also: Extruder1, FUZZY_SKIN
    BLOCKER   = 2,    // Also: Extruder2
    Extruder3 = 3,
    Extruder4 = 4,
    Extruder5 = 5,
    // ... continues to Extruder24
    ExtruderMax = 24   // (likely)
};
```

**Mapping to filament colors:**
- `NONE (0)` = no paint → use part/object default extruder
- `Extruder1 (1)` = filament_colour[0]
- `Extruder2 (2)` = filament_colour[1]
- `Extruder3 (3)` = filament_colour[2]
- `ExtruderN` = filament_colour[N-1]

### 6.4 Decoding Examples

#### Simple: `paint_color="8"`
```
Hex "8" → nibble = 0x8 = 0b1000
  yy = 0b00 = 0 → leaf triangle (no subdivision)
  xx = 0b10 = 2 → EnforcerBlockerType::BLOCKER / Extruder2
Result: Entire triangle = Extruder 2 (filament_colour[1])
```

#### Simple: `paint_color="0C"`
Read right-to-left: "C0" → nibbles [0xC, 0x0]
```
Wait — actually the serialization reverses. Let me re-derive:

get_triangle_as_string() reads bits from offset to end, takes 4 bits at a time,
converts to hex digit, and INSERTS AT BEGINNING (out.insert(out.begin(), digit)).

So the FIRST hex char in the string = LAST 4 bits of the bitstream.
To decode, read the string RIGHT-TO-LEFT.

"0C" → read right-to-left: first nibble = C (0b1100), second nibble = 0 (0b0000)

First nibble 0xC = 0b1100:
  yy = 0b00 = 0 → leaf
  xx = 0b11 = 3 → EXTENDED encoding: read next nibble
Second nibble 0x0 = 0b0000 = 0:
  state = 0 + 3 = 3 → Extruder3

Result: Entire triangle = Extruder 3 (filament_colour[2])
```

#### Complex: `paint_color="0C0C80C0C30C0C3"`

This represents a triangle that has been **subdivided** with different child triangles assigned to different extruders. The tree structure encodes:
- Split information (how the triangle was subdivided: 1-side, 2-side, or 3-side split)
- Recursive child triangle states
- Leaf states for the final sub-triangles

For a color preview tool, subdivided triangles can be handled two ways:
1. **Simple approach**: Use the most common color in the subtree, or the first leaf color
2. **Accurate approach**: Reconstruct the full triangle subdivision tree and render sub-triangles

### 6.5 Decoding Algorithm

```javascript
function decodePaintColor(hexString) {
    // Convert hex string to array of nibbles (read RIGHT-TO-LEFT)
    const nibbles = [];
    for (let i = hexString.length - 1; i >= 0; i--) {
        nibbles.push(parseInt(hexString[i], 16));
    }

    let pos = 0;
    function nextNibble() {
        return nibbles[pos++];
    }

    function decodeTriangle() {
        const code = nextNibble();
        const splitSides = code & 0b11;        // yy bits
        const upperBits = (code >> 2) & 0b11;  // xx bits

        if (splitSides > 0) {
            // Non-leaf: triangle is subdivided
            const specialSide = upperBits;
            const numChildren = splitSides + 1;
            const children = [];
            // Children serialized in REVERSE order for compat with PrusaSlicer 2.3.1
            for (let i = numChildren - 1; i >= 0; i--) {
                children[i] = decodeTriangle();
            }
            return { type: 'split', splitSides, specialSide, children };
        } else {
            // Leaf: get state
            let state;
            if (upperBits === 0b11) {
                // Extended encoding for values >= 3
                let nextCode = nextNibble();
                let num = 0;
                while (nextCode === 0b1111) {
                    num++;
                    nextCode = nextNibble();
                }
                state = nextCode + 15 * num + 3;
            } else {
                state = upperBits;  // 0=NONE, 1=Extruder1, 2=Extruder2
            }
            return { type: 'leaf', state };
        }
    }

    return decodeTriangle();
}
```

### 6.6 Practical Simplification

For a color customizer that doesn't need sub-triangle accuracy, you can use a **majority vote** approach:

```javascript
function getSimplePaintColor(hexString) {
    // Count leaf states in the paint_color tree
    const tree = decodePaintColor(hexString);
    const counts = {};
    function countLeaves(node) {
        if (node.type === 'leaf') {
            counts[node.state] = (counts[node.state] || 0) + 1;
        } else {
            node.children.forEach(countLeaves);
        }
    }
    countLeaves(tree);
    // Return the most common non-NONE state
    let maxState = 0, maxCount = 0;
    for (const [state, count] of Object.entries(counts)) {
        if (parseInt(state) > 0 && count > maxCount) {
            maxState = parseInt(state);
            maxCount = count;
        }
    }
    return maxState; // 0 = no paint, 1+ = extruder index
}
```

---

## 7. Three.js ThreeMFLoader Behavior

### 7.1 What It Handles

- Parses `<basematerials>` and creates materials with `displaycolor`
- Parses `<m:colorgroup>` and creates vertex colors
- Resolves `pid`/`p1`/`p2`/`p3` to material groups
- Groups triangles by resource ID → one mesh per material
- Supports multi-model 3MF packages (parses all .model files)
- Converts colors to `SRGBColorSpace`

### 7.2 What It Does NOT Handle

- **Does NOT read `paint_color` attribute** (Bambu Studio proprietary)
- **Does NOT read `model_settings.config`** (Bambu Studio proprietary)
- **Does NOT read `project_settings.config`** (Bambu Studio proprietary)
- Does NOT handle `<multiproperties>` blending
- Does NOT handle alpha blending per-vertex
- No metallic/roughness per-vertex (only material-level PBR via `pbmetallicdisplayproperties`)

### 7.3 Mesh Creation Strategy

ThreeMFLoader creates **multiple meshes per color group**:
1. Groups triangles by their resource ID (material/colorgroup)
2. Each group becomes a separate `THREE.Mesh` with its own geometry
3. For vertex colors: creates a `Float32BufferAttribute('color')` per geometry
4. For basematerials: creates `MeshPhongMaterial` with `displaycolor`

### 7.4 Implication for Our Project

**ThreeMFLoader will NOT correctly display colors from Bambu Studio 3MF files.** Since Bambu files don't use pid/p1/p2/p3 or basematerials resources, every triangle will be colorless. We MUST implement custom parsing that:
1. Reads `model_settings.config` for extruder assignments
2. Reads `project_settings.config` for filament colors
3. Optionally reads `paint_color` attributes for per-triangle coloring
4. Maps part IDs to their corresponding mesh geometry

---

## 8. Known Issues and Edge Cases

### 8.1 GitHub Issue #4292: Non-Standard 3MF Export

Bambu Studio's 3MF exports include the `paint_color` attribute which is **not part of the 3MF specification**. Bambu Lab's position is that this is simply an "other attribute" that compliant parsers should ignore. However, this means:
- Standard 3MF viewers will not show colors from Bambu files
- Other slicers (PrusaSlicer, OrcaSlicer, Cura) must handle this proprietary format separately

### 8.2 PrusaSlicer vs Bambu Studio Attribute Names

| Feature | PrusaSlicer | Bambu Studio |
|---------|-------------|--------------|
| MMU painting | `slic3rpe:mmu_segmentation` | `paint_color` |
| Support painting | `slic3rpe:custom_supports` | `paint_supports` |
| Seam painting | `slic3rpe:custom_seam` | `paint_seam` |
| Model config | `Metadata/Slic3r_PE_model.config` | `Metadata/model_settings.config` |
| Project config | `Metadata/Slic3r_PE.config` | `Metadata/project_settings.config` |

The encoding format is the **same** (shared TriangleSelector codebase), but the attribute names and file paths differ.

### 8.3 Extruder Indexing Confusion

- **model_settings.config** uses **1-based** extruder indices
- **filament_colour** array in project_settings.config is **0-based**
- **EnforcerBlockerType::Extruder1** has numeric value **1**
- **paint_color decoded state** of 1 = Extruder1 = filament_colour[0]
- Off-by-one errors here are very common

### 8.4 Objects Sharing Sub-Model Files

Multiple root-model objects can reference the **same** sub-model file but different object IDs within it. They can also reference the same object ID but with different transforms and different extruder assignments in model_settings.config. The part ID in model_settings.config maps to the objectid in the sub-model.

### 8.5 Negative Parts Don't Reduce Geometry in 3MF

The boolean subtraction is done at **slice time**, not stored in the mesh. The 3MF still contains the full positive and negative geometry. For a 3D preview, you'd need to either:
- Ignore negative parts and show only normal_part meshes
- Implement CSG boolean operations client-side

### 8.6 Missing paint_color on Triangles

If a triangle has no `paint_color` attribute, it uses the part/object default extruder. In the real file, many triangles have no paint_color. The absence means "use the inherited extruder assignment."

### 8.7 filament_maps Per-Plate Remapping

`filament_maps="1 1 1 1"` on a plate means all 4 extruder slots are remapped to filament 1. This is a **slicer optimization** to reduce filament changes and is only relevant during slicing, not for color preview. For preview purposes, use the direct extruder-to-filament_colour mapping.

---

## 9. Practical Implications for Our Parser

### 9.1 Minimum Viable Color Extraction

To extract colors from a Bambu Studio 3MF file:

1. **Unzip** the 3MF archive
2. **Parse** `Metadata/project_settings.config` (JSON) → extract `filament_colour` array
3. **Parse** `Metadata/model_settings.config` (XML) → extract object/part extruder assignments and plate layout
4. **Parse** `3D/_rels/3dmodel.model.rels` → discover sub-model file paths
5. **Parse** `3D/3dmodel.model` → build component tree (object → components with p:path and transforms)
6. **Parse** each `3D/Objects/*.model` → extract mesh geometry
7. For each triangle:
   - If `paint_color` present → decode to extruder index → map to filament_colour
   - Else → look up part extruder → look up object extruder → use default

### 9.2 Data Structures Needed

```typescript
interface BambuProject {
  filamentColors: string[];          // from project_settings.config
  filamentTypes: string[];           // PLA, PETG, etc.
  objects: Map<number, BambuObject>; // keyed by object id in root model
  plates: BambuPlate[];
}

interface BambuObject {
  id: number;
  name: string;
  defaultExtruder: number;           // 1-based
  parts: BambuPart[];
  components: BambuComponent[];      // from root model
}

interface BambuPart {
  id: number;                        // matches objectid in sub-model
  name: string;
  subtype: 'normal_part' | 'negative_part' | 'modifier_part' | 'support_blocker' | 'support_enforcer';
  extruder?: number;                 // 1-based, overrides object default
  matrix: number[];                  // 4x4 transform
  faceCount: number;
}

interface BambuComponent {
  path: string;                      // sub-model file path
  objectId: number;                  // object id within sub-model
  transform: number[];               // 3x4 or 4x4 transform matrix
  uuid: string;
}

interface BambuPlate {
  id: number;
  filamentMapMode: string;
  filamentMaps: number[];            // per-slot remapping
  instances: { objectId: number; instanceId: number }[];
}
```

### 9.3 Color Zone Detection Strategy

For the color customizer, "color zones" are groups of triangles that share the same resolved color:

1. **Part-level zones** (most common): Each part with a distinct extruder assignment forms one color zone
2. **Paint-level zones** (when paint_color is used): Individual or groups of triangles within a part that have been painted to different extruders

For MVP, treating each **part** as a color zone (using its resolved extruder) is sufficient. The paint_color sub-triangle data can be a later enhancement.

### 9.4 Transform Chain

To get the final world position of a triangle:

```
worldPosition = buildItemTransform × componentTransform × partMatrix × vertexPosition
```

Where:
- `buildItemTransform`: from `<item transform="...">` in the `<build>` section
- `componentTransform`: from `<component transform="...">` in the root model
- `partMatrix`: from `<metadata key="matrix" value="...">` in model_settings.config
- `vertexPosition`: from `<vertex x="..." y="..." z="...">` in sub-model

Note: The component transform in the root model and the part matrix in model_settings.config may be redundant/overlapping. Testing with real data is needed to determine which to use.

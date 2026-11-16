"""CHAOS-78: GLB → USDZ für den RealityKit-Spike, mit Blender als Python-Modul (bpy).

Aufruf: python glb_to_usdz.py <in.glb> <out.usdz> [--anim=<clipname>]

Ohne --anim wird ohne Animation exportiert (Kulisse). Mit --anim wird nur dieser Clip
(z. B. `idle`) auf das Skelett gelegt und als USD-Skelettanimation exportiert.
glTF ist rechtshändig Y-up; Blender importiert nach Z-up, der Export dreht mit
`convert_orientation` zurück nach Y-up (wie RealityKit), sodass Weltkoordinaten aus
`brett.szene.json` und `brett.instanzen.json` unverändert gelten. Die Drehung steckt als
rotateX(-90°) auf /root; Meshdaten bleiben lokal Z-up (wichtig für Instanzen, siehe README).
"""

import sys

import bpy

args = [a for a in sys.argv[1:] if not a.startswith("--")]
anim = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--anim=")), None)
src, dst = args

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)

# Babylon benennt Bilder nach ihrer URL ("/host/@fs/…/leafy_grass_diff.webp"); der USD-Export
# legt sie dann in Unterordner, verweist aber auf textures/<basename> → Bild fehlt im USDZ.
for img in bpy.data.images:
    img.name = img.name.rsplit("/", 1)[-1].rsplit(".", 1)[0]

# Vertexfarben (Figuren, Gras): RealityKit ignoriert UsdPrimvarReader im Material (Basisfarbe
# grau 0,18) und auch `primvars:displayColor`, sobald ein Material gebunden ist. Ohne Material
# zeigt es displayColor. Darum: Materialfaktor in die Vertexfarbe multiplizieren, Material lösen.
def vertex_color_factor(mat):
    """Faktor, mit dem das Material die Vertexfarbe multipliziert, sonst None."""
    for node in mat.node_tree.nodes if mat and mat.node_tree else []:
        if node.bl_idname != "ShaderNodeBsdfPrincipled" or not node.inputs["Base Color"].is_linked:
            continue
        src_node = node.inputs["Base Color"].links[0].from_node
        if src_node.bl_idname == "ShaderNodeAttribute":
            return (1.0, 1.0, 1.0)
        if src_node.bl_idname == "ShaderNodeMix" and any(
            l.from_node.bl_idname == "ShaderNodeAttribute" for i in src_node.inputs for l in i.links
        ):
            return tuple(next(i for i in src_node.inputs if i.name == "B" and i.type == "RGBA").default_value[:3])
    return None


for me in bpy.data.meshes:
    if not me.color_attributes:
        continue
    factors = {vertex_color_factor(m) for m in me.materials}
    if len(factors) != 1 or None in factors:
        print(f"WARNUNG: {me.name}: Vertexfarbe bleibt ungenutzt (Materialien {[m.name for m in me.materials]})")
        continue
    (factor,) = factors
    attr = me.color_attributes.active_color or me.color_attributes[0]
    for d in attr.data:
        d.color = (*(c * f for c, f in zip(d.color[:3], factor)), d.color[3])
    attr.name = "displayColor"
    print(f"Vertexfarbe: {me.name} ohne Material {[m.name for m in me.materials]}, Faktor {factor}")
    me.materials.clear()

if anim:
    action = bpy.data.actions.get(anim)
    assert action, f"Clip {anim!r} fehlt, vorhanden: {[a.name for a in bpy.data.actions]}"
    for ob in bpy.data.objects:
        if ob.type == "ARMATURE":
            ob.animation_data_create().action = action
            # Blender 4.4+: Aktionen haben Slots; den passenden für dieses Objekt wählen.
            slots = [s for s in action.slots if s.target_id_type == "OBJECT"]
            if slots and ob.animation_data.action_slot is None:
                ob.animation_data.action_slot = slots[0]
        elif ob.animation_data:
            ob.animation_data.action = None
    start, end = (int(round(f)) for f in action.frame_range)
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = start, max(end, start + 1)

bpy.ops.wm.usd_export(
    filepath=dst,
    export_animation=bool(anim),
    # Robot: Teile hängen starr an Knochen, kein Mesh ist geskinnt. Ein Skeleton ohne SkelRoot
    # wäre ungültiges USD; die Knochenbewegung steckt ohnehin in den Xform-Zeitreihen.
    export_armatures=any(m.type == "ARMATURE" for ob in bpy.data.objects for m in ob.modifiers),
    export_materials=True,
    generate_preview_surface=True,
    export_textures_mode="NEW",
    convert_orientation=True,
    export_global_forward_selection="NEGATIVE_Z",
    export_global_up_selection="Y",
    export_lights=False,
    export_cameras=False,
    root_prim_path="/root",
)
print(f"USDZ: {dst}")

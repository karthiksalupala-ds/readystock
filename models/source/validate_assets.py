"""Validate the reusable InteliDar GLB library without third-party packages.

Run ``python models/source/validate_assets.py`` to write models/validation.json.
``validate_pack(path)`` is read-only. ``validate_blender_roundtrip(path)`` is an
optional bpy-only import check which restores the active scene afterwards.
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import struct
import sys


IDENTITY = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0]
COMPONENTS = {
    5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2),
    5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4),
}
TYPE_SHAPES = {"SCALAR": (1, 1), "VEC2": (1, 2), "VEC3": (1, 3),
               "VEC4": (1, 4), "MAT2": (2, 2), "MAT3": (3, 3),
               "MAT4": (4, 4)}


def _matmul(left, right):
    return [sum(left[k * 4 + row] * right[col * 4 + k] for k in range(4))
            for col in range(4) for row in range(4)]


def _point(matrix, position):
    return tuple(sum(matrix[col * 4 + row] * position[col] for col in range(3))
                 + matrix[12 + row] for row in range(3))


def _node_matrix(node):
    if "matrix" in node:
        matrix = node["matrix"]
        if len(matrix) != 16 or any(not math.isfinite(v) for v in matrix):
            raise ValueError("node matrix must have 16 finite values")
        if any(key in node for key in ("translation", "rotation", "scale")):
            raise ValueError("node combines matrix and TRS transforms")
        return list(matrix)
    translation = node.get("translation", [0.0, 0.0, 0.0])
    rotation = node.get("rotation", [0.0, 0.0, 0.0, 1.0])
    scale = node.get("scale", [1.0, 1.0, 1.0])
    if len(translation) != 3 or len(rotation) != 4 or len(scale) != 3:
        raise ValueError("invalid TRS component length")
    if any(not math.isfinite(v) for v in translation + rotation + scale):
        raise ValueError("nonfinite node transform")
    if any(abs(v) < 1e-10 for v in scale):
        raise ValueError("zero node scale")
    if abs(sum(v * v for v in rotation) - 1.0) > 1e-3:
        raise ValueError("node rotation quaternion is not normalized")
    x, y, z, w = rotation
    sx, sy, sz = scale
    return [(1 - 2 * (y*y + z*z)) * sx, 2 * (x*y + z*w) * sx,
            2 * (x*z - y*w) * sx, 0.0,
            2 * (x*y - z*w) * sy, (1 - 2 * (x*x + z*z)) * sy,
            2 * (y*z + x*w) * sy, 0.0,
            2 * (x*z + y*w) * sz, 2 * (y*z - x*w) * sz,
            (1 - 2 * (x*x + y*y)) * sz, 0.0,
            translation[0], translation[1], translation[2], 1.0]


class Glb:
    def __init__(self, path):
        payload = Path(path).read_bytes()
        if len(payload) < 20:
            raise ValueError("file is too small to contain a GLB")
        magic, version, length = struct.unpack_from("<4sII", payload)
        if magic != b"glTF" or version != 2 or length != len(payload):
            raise ValueError("invalid GLB 2.0 header or file length")
        chunks = []
        offset = 12
        while offset < length:
            if offset + 8 > length:
                raise ValueError("truncated GLB chunk header")
            size, kind = struct.unpack_from("<II", payload, offset)
            offset += 8
            if size % 4 or offset + size > length:
                raise ValueError("invalid GLB chunk size")
            chunks.append((kind, payload[offset:offset + size]))
            offset += size
        if not chunks or chunks[0][0] != 0x4E4F534A:
            raise ValueError("GLB must start with a JSON chunk")
        self.doc = json.loads(chunks[0][1].decode("utf-8"))
        if self.doc.get("asset", {}).get("version") != "2.0":
            raise ValueError("asset.version is not glTF 2.0")
        binary_chunks = [data for kind, data in chunks if kind == 0x004E4942]
        if len(binary_chunks) != 1:
            raise ValueError("expected one embedded binary chunk")
        self.binary = binary_chunks[0]
        buffers = self.doc.get("buffers", [])
        if len(buffers) != 1 or "uri" in buffers[0]:
            raise ValueError("expected one embedded buffer without an external URI")
        declared_length = buffers[0].get("byteLength", -1)
        if not 0 <= len(self.binary) - declared_length <= 3:
            raise ValueError("embedded binary size does not match buffer.byteLength")
        for view in self.doc.get("bufferViews", []):
            if view.get("buffer") != 0:
                raise ValueError("bufferView references a missing/external buffer")
            if view.get("byteOffset", 0) < 0 or view.get("byteLength", -1) < 0:
                raise ValueError("invalid bufferView range")
            if view.get("byteOffset", 0) + view["byteLength"] > declared_length:
                raise ValueError("bufferView exceeds embedded buffer bounds")
        for image in self.doc.get("images", []):
            if "uri" in image or "bufferView" not in image:
                raise ValueError("image is not embedded as a GLB bufferView")
        self._accessors = {}

    def _read_view(self, view_index, offset, count, component_type, kind,
                   normalized=False, use_stride=True):
        view = self.doc["bufferViews"][view_index]
        code, size = COMPONENTS[component_type]
        columns, rows = TYPE_SHAPES[kind]
        column_stride = ((rows * size + 3) // 4) * 4 if columns > 1 else rows * size
        element_size = columns * column_stride
        stride = view.get("byteStride", element_size) if use_stride else element_size
        if offset < 0 or count < 0 or stride < element_size:
            raise ValueError("invalid accessor offset, count, or stride")
        end = offset + (count - 1) * stride + element_size if count else offset
        if end > view["byteLength"]:
            raise ValueError("accessor exceeds its bufferView")
        base = view.get("byteOffset", 0) + offset
        result = []
        for index in range(count):
            values = []
            for col in range(columns):
                values.extend(struct.unpack_from("<" + code * rows, self.binary,
                                                base + index * stride + col * column_stride))
            if normalized and component_type != 5126:
                maximum = {5120: 127, 5121: 255, 5122: 32767,
                           5123: 65535, 5125: 4294967295}[component_type]
                values = [max(-1.0, value / maximum) for value in values]
            result.append(tuple(values))
        return result

    def accessor(self, index):
        if index in self._accessors:
            return self._accessors[index]
        accessor = self.doc["accessors"][index]
        count = accessor["count"]
        kind = accessor["type"]
        component_type = accessor["componentType"]
        if "bufferView" in accessor:
            values = self._read_view(accessor["bufferView"], accessor.get("byteOffset", 0),
                                     count, component_type, kind,
                                     accessor.get("normalized", False))
        else:
            columns, rows = TYPE_SHAPES[kind]
            values = [(0,) * (columns * rows) for _ in range(count)]
        if "sparse" in accessor:
            sparse = accessor["sparse"]
            indices = sparse["indices"]
            replacements = sparse["values"]
            if indices["componentType"] not in (5121, 5123, 5125):
                raise ValueError("invalid sparse index component type")
            sparse_indices = self._read_view(indices["bufferView"], indices.get("byteOffset", 0),
                                             sparse["count"], indices["componentType"],
                                             "SCALAR", use_stride=False)
            sparse_values = self._read_view(replacements["bufferView"],
                                            replacements.get("byteOffset", 0), sparse["count"],
                                            component_type, kind, accessor.get("normalized", False),
                                            use_stride=False)
            previous = -1
            for (target,), replacement in zip(sparse_indices, sparse_values):
                if target <= previous or target >= count:
                    raise ValueError("invalid or unordered sparse accessor indices")
                values[target] = replacement
                previous = target
        if any(not math.isfinite(value) for row in values for value in row):
            raise ValueError("accessor {} contains nonfinite values".format(index))
        self._accessors[index] = values
        return values


def _bounds(points):
    if not points:
        return None
    minimum = [min(p[axis] for p in points) for axis in range(3)]
    maximum = [max(p[axis] for p in points) for axis in range(3)]
    return {"min": [round(v, 6) for v in minimum],
            "max": [round(v, 6) for v in maximum],
            "dimensions_m": [round(hi - lo, 6) for lo, hi in zip(minimum, maximum)]}


def validate_asset(path):
    path = Path(path)
    result = {"filename": path.name, "path": str(path.resolve()),
              "file_bytes": path.stat().st_size, "failures": [], "warnings": []}
    failures = result["failures"]
    warnings = result["warnings"]
    try:
        glb = Glb(path)
        doc = glb.doc
        nodes = doc.get("nodes", [])
        meshes = doc.get("meshes", [])
        materials = doc.get("materials", [])
        scene_index = doc.get("scene", 0)
        scenes = doc.get("scenes", [])
        if not scenes or not 0 <= scene_index < len(scenes):
            raise ValueError("no valid default scene")
        roots = scenes[scene_index].get("nodes", [])
        if not roots or not meshes:
            raise ValueError("scene has no root nodes or mesh geometry")
        local = [_node_matrix(node) for node in nodes]
        global_matrices = {}
        active = set()

        def visit(index, parent_matrix):
            if not 0 <= index < len(nodes):
                raise ValueError("node references an invalid child")
            if index in active:
                raise ValueError("cycle in node hierarchy")
            if index in global_matrices:
                raise ValueError("node has multiple parents")
            active.add(index)
            global_matrices[index] = _matmul(parent_matrix, local[index])
            for child in nodes[index].get("children", []):
                visit(child, global_matrices[index])
            active.remove(index)

        for index in roots:
            visit(index, IDENTITY)
            if any(abs(a - b) > 1e-5 for a, b in zip(local[index], IDENTITY)):
                failures.append("scene root '{}' has a nonidentity origin transform".format(
                    nodes[index].get("name", index)))
        for index in range(len(doc.get("accessors", []))):
            glb.accessor(index)
        result["materials"] = []
        for material in materials:
            if not material.get("name"):
                failures.append("unnamed material")
            pbr = material.get("pbrMetallicRoughness", {})
            color = pbr.get("baseColorFactor", [1, 1, 1, 1])
            metallic = pbr.get("metallicFactor", 1)
            roughness = pbr.get("roughnessFactor", 1)
            if len(color) != 4 or any(not math.isfinite(v) or not 0 <= v <= 1 for v in color):
                failures.append("invalid PBR base color")
            if any(not math.isfinite(v) or not 0 <= v <= 1 for v in (metallic, roughness)):
                failures.append("invalid PBR metallic/roughness factors")
            result["materials"].append({"name": material.get("name", ""),
                                        "base_color": color, "metallic": metallic,
                                        "roughness": roughness,
                                        "alpha_mode": material.get("alphaMode", "OPAQUE"),
                                        "double_sided": material.get("doubleSided", False)})
        result["material_count"] = len(materials)
        result["mesh_count"] = len(meshes)
        result["node_count"] = len(nodes)
        result["skins_count"] = len(doc.get("skins", []))
        result["joint_counts"] = [len(skin.get("joints", [])) for skin in doc.get("skins", [])]
        triangles = 0
        vertices = 0
        all_points = []
        primitive_count = 0
        for node_index, matrix in global_matrices.items():
            node = nodes[node_index]
            if "mesh" not in node:
                continue
            mesh = meshes[node["mesh"]]
            skin_matrices = None
            if "skin" in node:
                skin = doc["skins"][node["skin"]]
                joints = skin.get("joints", [])
                if not joints:
                    raise ValueError("skin contains no joints")
                binds = glb.accessor(skin["inverseBindMatrices"]) if "inverseBindMatrices" in skin else [IDENTITY] * len(joints)
                if len(binds) != len(joints):
                    raise ValueError("skin inverse bind count differs from joint count")
                skin_matrices = [_matmul(global_matrices[joint], bind)
                                 for joint, bind in zip(joints, binds)]
            for primitive in mesh.get("primitives", []):
                primitive_count += 1
                attributes = primitive.get("attributes", {})
                if "POSITION" not in attributes:
                    raise ValueError("mesh primitive has no POSITION accessor")
                positions = glb.accessor(attributes["POSITION"])
                count = len(positions)
                vertices += count
                if not count or any(len(p) != 3 for p in positions):
                    raise ValueError("invalid or empty mesh positions")
                for semantic in ("NORMAL", "TEXCOORD_0"):
                    if semantic not in attributes:
                        failures.append("mesh '{}' primitive missing {}".format(mesh.get("name", ""), semantic))
                    elif len(glb.accessor(attributes[semantic])) != count:
                        failures.append("{} attribute count differs from POSITION".format(semantic))
                if "NORMAL" in attributes:
                    normals = glb.accessor(attributes["NORMAL"])
                    if any(len(n) != 3 or abs(sum(v*v for v in n) - 1) > 0.025 for n in normals):
                        failures.append("mesh contains nonunit or invalid normals")
                if "material" not in primitive or not 0 <= primitive["material"] < len(materials):
                    failures.append("primitive has no valid material")
                indices = [row[0] for row in glb.accessor(primitive["indices"])] if "indices" in primitive else list(range(count))
                if any(not isinstance(i, int) or not 0 <= i < count for i in indices):
                    raise ValueError("primitive contains out-of-range vertex indices")
                mode = primitive.get("mode", 4)
                if mode == 4:
                    if len(indices) % 3:
                        failures.append("triangle index count is not divisible by three")
                    triangles += len(indices) // 3
                elif mode in (5, 6):
                    triangles += max(0, len(indices) - 2)
                else:
                    failures.append("primitive uses nontriangle topology")
                if skin_matrices is not None:
                    if "JOINTS_0" not in attributes or "WEIGHTS_0" not in attributes:
                        raise ValueError("skinned primitive is missing joints or weights")
                    joint_values = glb.accessor(attributes["JOINTS_0"])
                    weight_values = glb.accessor(attributes["WEIGHTS_0"])
                    if len(joint_values) != count or len(weight_values) != count:
                        raise ValueError("skin attribute count mismatch")
                    for position, vertex_joints, weights in zip(positions, joint_values, weight_values):
                        if abs(sum(weights) - 1) > 0.01 or any(w < 0 for w in weights):
                            raise ValueError("skin weights are negative or do not sum to one")
                        if any(not isinstance(j, int) or not 0 <= j < len(skin_matrices) for j in vertex_joints):
                            raise ValueError("skin joint index is out of range")
                        transformed = [_point(skin_matrices[j], position) for j in vertex_joints]
                        all_points.append(tuple(sum(p[axis] * w for p, w in zip(transformed, weights)) for axis in range(3)))
                else:
                    all_points.extend(_point(matrix, position) for position in positions)
        result["triangles"] = triangles
        result["vertices"] = vertices
        result["primitive_count"] = primitive_count
        result["bounds_y_up"] = _bounds(all_points)
        result["origin"] = "identity root; base at glTF Y=0" if all_points and abs(min(p[1] for p in all_points)) < 0.002 else "see bounds"
        if not triangles:
            failures.append("no triangles found")
        if all_points:
            if any(not math.isfinite(v) for p in all_points for v in p):
                failures.append("nonfinite world-space positions")
            dimensions = result["bounds_y_up"]["dimensions_m"]
            if min(dimensions) <= 0 or max(dimensions) > 10:
                failures.append("dimensions are empty or implausible for an indoor asset in meters")
            if abs(min(p[1] for p in all_points)) > 0.003:
                warnings.append("lowest point is not within 3 mm of the floor (Y=0)")
        animations = []
        for animation in doc.get("animations", []):
            all_times = []
            for sampler in animation.get("samplers", []):
                times = [row[0] for row in glb.accessor(sampler["input"])]
                if any(b <= a for a, b in zip(times, times[1:])):
                    failures.append("animation key times are not strictly increasing")
                if times and times[0] < 0:
                    failures.append("negative animation key time")
                all_times.extend(times)
                glb.accessor(sampler["output"])
            animations.append({"name": animation.get("name", ""),
                               "duration_seconds": round(max(all_times) - min(all_times), 6) if all_times else 0,
                               "channels": len(animation.get("channels", []))})
        result["animations"] = animations
        result["embedded_only"] = True
        result["gltf_version"] = "2.0"
        result["extras"] = doc.get("asset", {}).get("extras", {})
    except (ValueError, KeyError, IndexError, TypeError, struct.error, OverflowError) as error:
        failures.append("{}: {}".format(type(error).__name__, error))
    result["ok"] = not failures
    return result


def validate_pack(root_path):
    """Return a JSON-serializable read-only report for every exported GLB."""
    root = Path(root_path).resolve()
    paths = sorted(path for path in root.rglob("*.glb")
                   if not set(path.relative_to(root).parts[:-1]) & {"source", "previews"})
    assets = [validate_asset(path) for path in paths]
    failures = [{"path": asset["path"], "failures": asset["failures"]}
                for asset in assets if not asset["ok"]]
    if not assets:
        failures.append({"path": str(root), "failures": ["no exported GLB assets found"]})
    return {"generated_at": datetime.now(timezone.utc).isoformat(),
            "root": str(root), "ok": not failures, "asset_count": len(assets),
            "total_triangles": sum(asset.get("triangles", 0) for asset in assets),
            "total_file_bytes": sum(asset["file_bytes"] for asset in assets),
            "assets": assets, "failures": failures}


def validate_blender_roundtrip(path):
    """Import one GLB into a clean temporary scene; restore the caller's scene.

    Call from Blender's main thread. Only data-blocks created by this import are
    eligible for cleanup. Armature modifiers are expected for rigged avatars.
    Geometry checks use the imported rest pose, not the first animation frame.
    """
    import bpy

    path = Path(path).resolve()
    result = {"path": str(path), "failures": [], "warnings": []}
    expected = validate_asset(path)
    tracked_types = ("objects", "collections", "scenes", "meshes", "armatures", "curves",
                     "materials", "images", "textures", "actions", "node_groups", "cameras", "lights", "worlds")
    before = {kind: {block.as_pointer() for block in getattr(bpy.data, kind)} for kind in tracked_types}
    window = bpy.context.window
    original_scene = window.scene if window else bpy.context.scene
    original_active = bpy.context.view_layer.objects.active
    original_selected = list(bpy.context.selected_objects)
    temporary_scene = bpy.data.scenes.new("__InteliDar_GLB_validation__")
    try:
        if window is None:
            raise RuntimeError("Blender validation requires a window context (also present in background mode)")
        window.scene = temporary_scene
        bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection
        import_result = bpy.ops.import_scene.gltf(filepath=str(path), import_pack_images=True)
        if "FINISHED" not in import_result:
            raise RuntimeError("Blender GLB import did not finish")
        imported = list(temporary_scene.objects)
        armatures = [obj for obj in imported if obj.type == "ARMATURE"]
        # Blender's glTF importer creates an Icosphere bone-display helper in
        # glTF_not_exported. Exclude only objects actually referenced by imported
        # pose bones; arbitrary hidden meshes must still undergo validation.
        bone_display_helpers = {bone.custom_shape for armature in armatures
                                for bone in armature.pose.bones if bone.custom_shape is not None}
        meshes = [obj for obj in imported if obj.type == "MESH" and obj not in bone_display_helpers]
        for obj in armatures:
            obj.data.pose_position = "REST"
        bpy.context.view_layer.update()
        all_points = []
        material_names = set()
        counts = Counter()
        for obj in meshes:
            mesh = obj.data
            mesh.calc_loop_triangles()
            counts["triangles"] += len(mesh.loop_triangles)
            counts["vertices"] += len(mesh.vertices)
            if not mesh.uv_layers:
                result["failures"].append("{} has no UV map after import".format(obj.name))
            if not mesh.materials or any(material is None for material in mesh.materials):
                result["failures"].append("{} has a missing material after import".format(obj.name))
            material_names.update(material.name for material in mesh.materials if material)
            if any(modifier.type != "ARMATURE" for modifier in obj.modifiers):
                result["failures"].append("{} contains an unexpected modifier".format(obj.name))
            for modifier in obj.modifiers:
                if modifier.type == "ARMATURE" and modifier.object not in armatures:
                    result["failures"].append("{} has an invalid imported armature modifier".format(obj.name))
            for vertex in mesh.vertices:
                point = obj.matrix_world @ vertex.co
                if any(not math.isfinite(value) for value in point):
                    result["failures"].append("{} has nonfinite imported geometry".format(obj.name))
                    break
                all_points.append(tuple(point))
            for polygon in mesh.polygons:
                if not math.isfinite(polygon.area) or polygon.area <= 1e-12:
                    counts["degenerate_polygons"] += 1
                if any(not math.isfinite(value) for value in polygon.normal) or polygon.normal.length < 0.5:
                    result["failures"].append("{} contains invalid face normals".format(obj.name))
                    break
            if mesh.uv_layers and any(not math.isfinite(value) for uv in mesh.uv_layers.active.data for value in uv.uv):
                result["failures"].append("{} contains nonfinite UVs".format(obj.name))
        if not meshes or not counts["triangles"]:
            result["failures"].append("no mesh triangles imported")
        if counts["degenerate_polygons"]:
            result["warnings"].append("{} degenerate polygons after Blender import".format(counts["degenerate_polygons"]))
        result.update({"mesh_count": len(meshes), "armature_count": len(armatures),
                       "excluded_bone_display_helpers": sorted(obj.name for obj in bone_display_helpers),
                       "bone_counts": [len(obj.data.bones) for obj in armatures],
                       "triangles": counts["triangles"], "vertices": counts["vertices"],
                       "materials": sorted(material_names), "bounds_z_up": _bounds(all_points),
                       "actions": sorted(action.name for action in bpy.data.actions
                                         if action.as_pointer() not in before["actions"])})
        if "triangles" in expected and counts["triangles"] != expected["triangles"]:
            result["failures"].append("triangle count changed during Blender import")
        if "material_count" in expected and len(material_names) != expected["material_count"]:
            result["failures"].append("material count changed during Blender import")
        if expected.get("skins_count", 0) > 0 and not armatures:
            result["failures"].append("skinned GLB imported without an armature")
        if result["bounds_z_up"] and expected.get("bounds_y_up"):
            gltf_size = expected["bounds_y_up"]["dimensions_m"]
            expected_size = [gltf_size[0], gltf_size[2], gltf_size[1]]
            imported_size = result["bounds_z_up"]["dimensions_m"]
            if any(abs(a - b) > 0.003 for a, b in zip(imported_size, expected_size)):
                result["failures"].append("rest-pose dimensions changed by more than 3 mm during Blender import")
    except Exception as error:
        result["failures"].append("{}: {}".format(type(error).__name__, error))
    finally:
        if window is not None:
            window.scene = original_scene
        for kind in tracked_types:
            collection = getattr(bpy.data, kind)
            created = [block for block in collection if block.as_pointer() not in before[kind]]
            for block in created:
                try:
                    if kind in ("objects", "collections", "scenes"):
                        collection.remove(block, do_unlink=True)
                    else:
                        # Importers may preserve animation actions via fake users.
                        block.use_fake_user = False
                        if block.users == 0:
                            collection.remove(block)
                except (ReferenceError, RuntimeError) as error:
                    result["warnings"].append("cleanup {}: {}".format(kind, error))
        # Dependencies can retain zero-user materials/actions until mesh removal.
        for kind in ("materials", "images", "textures", "actions", "node_groups"):
            collection = getattr(bpy.data, kind)
            for block in list(collection):
                if block.as_pointer() not in before[kind] and block.users == 0:
                    collection.remove(block)
        if window is not None:
            for obj in original_selected:
                if obj.name in original_scene.objects:
                    obj.select_set(True)
            if original_active is not None and original_active.name in original_scene.objects:
                bpy.context.view_layer.objects.active = original_active
    result["ok"] = not result["failures"]
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path, help="defaults to ROOT/validation.json")
    parser.add_argument("--blender-roundtrip", action="store_true", help="also import every GLB using bpy")
    args = parser.parse_args(argv)
    report = validate_pack(args.root)
    if args.blender_roundtrip:
        for asset in report["assets"]:
            asset["blender_roundtrip"] = validate_blender_roundtrip(asset["path"])
            if not asset["blender_roundtrip"]["ok"]:
                report["ok"] = asset["ok"] = False
                report["failures"].append({"path": asset["path"],
                                            "failures": asset["blender_roundtrip"]["failures"]})
    output = args.output or args.root / "validation.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("{}: {} assets, {:,} triangles, {:,} bytes; report {}".format(
        "PASS" if report["ok"] else "FAIL", report["asset_count"],
        report["total_triangles"], report["total_file_bytes"], output.resolve()))
    for failure in report["failures"]:
        print("{}: {}".format(failure["path"], "; ".join(failure["failures"])))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    cli_arguments = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    raise SystemExit(main(cli_arguments))

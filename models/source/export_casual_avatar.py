"""Rebuild only the casual GLB, leaving the library .blend and other assets intact.

blender --background --factory-startup --python models/source/export_casual_avatar.py
Optional: -- --output path/to/avatar_casual.glb --preview test-results/seated.png
"""
import argparse
from pathlib import Path
import sys

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_avatars import build_avatar
from build_pack import material


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'avatars/avatar_casual.glb')
    parser.add_argument('--preview', type=Path)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    collection = bpy.data.collections.new('avatar_casual')
    bpy.context.scene.collection.children.link(collection)
    avatar = build_avatar('avatar_casual', 'casual', collection, {'dark': material('dark', '293239', .56, .15)})
    bpy.ops.object.select_all(action='DESELECT')
    for obj in avatar['objects']:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = avatar['root']
    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(args.output.resolve()), export_format='GLB', use_selection=True, use_active_scene=True,
        export_yup=True, export_apply=False, export_texcoords=True, export_normals=True,
        export_materials='EXPORT', export_cameras=False, export_lights=False, export_extras=True,
        export_animations=True, export_skins=True, export_animation_mode='NLA_TRACKS',
        export_force_sampling=True, export_anim_slide_to_zero=True, export_frame_range=False)
    if args.preview:
        from preview_pack import camera, lighting, mat
        scene = bpy.context.scene
        scene.frame_set(301)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, .035, .42))
        seat = bpy.context.object
        seat.name = 'Reference seat surface 0.46 m'
        seat.dimensions = (.46, .46, .08)
        seat.data.materials.append(mat('Seat teal', (.025, .25, .23)))
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, .25, .65))
        back = bpy.context.object
        back.dimensions = (.46, .05, .46)
        back.data.materials.append(mat('Seat teal', (.025, .25, .23)))
        bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.012))
        bpy.context.object.data.materials.append(mat('Floor', (.52, .55, .55)))
        scene.render.engine = 'CYCLES'
        scene.cycles.samples = 24
        scene.cycles.use_denoising = True
        scene.world.color = (.3, .3, .3)
        scene.render.resolution_x = 960
        scene.render.resolution_y = 960
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = 'PNG'
        camera(scene, (2.8, -3, 1.8), (0, -.1, .65), 1.85)
        lighting(scene, 4)
        args.preview.parent.mkdir(parents=True, exist_ok=True)
        scene.render.filepath = str(args.preview.resolve())
        bpy.ops.render.render(write_still=True)
    print('EXPORTED', args.output, avatar['animations'])


if __name__ == '__main__':
    main()

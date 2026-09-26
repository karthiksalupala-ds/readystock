"""Reusable procedural humanoids for the InteliDar asset library.

Run inside Blender. ``build_avatar(name, variant, collection, palette)`` creates
one skinned mesh, one armature and locomotion actions, without deleting any
existing scene data. Coordinates are metres, Z up, front -Y. Export the returned
objects together using glTF ``export_animation_mode='NLA_TRACKS'``. All NLA tracks
remain unmuted for export; their strips occupy consecutive timeline ranges, and
``export_anim_slide_to_zero=True`` gives each GLB clip a zero start time.
"""

import math
import bpy
import bmesh
from mathutils import Quaternion, Vector


SEATED_SURFACE_HEIGHT = .46
SEATING_TRANSITION_FRAMES = 20


def _material(name, rgb, roughness=0.75):
    material = bpy.data.materials.get(name)
    if material is None:
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Base Color'].default_value = (*rgb, 1.0)
        shader.inputs['Roughness'].default_value = roughness
        material.diffuse_color = (*rgb, 1.0)
    return material


def _move_to_collection(obj, collection):
    for previous in list(obj.users_collection):
        previous.objects.unlink(obj)
    collection.objects.link(obj)


def _finish_piece(obj, collection, material, bone, pieces):
    _move_to_collection(obj, collection)
    obj.data.materials.append(material)
    if bone:
        obj.vertex_groups.new(name=bone).add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    pieces.append(obj)
    return obj


def _box(name, centre, size, material, bone, collection, pieces, bevel=0.012):
    bpy.ops.mesh.primitive_cube_add(size=1, location=centre)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new('Rounded edges', 'BEVEL')
        modifier.width = min(bevel, min(size) * 0.30)
        modifier.segments = 2
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    # Flat broad surfaces and smooth bevels preserve a clean low-poly finish.
    for polygon in obj.data.polygons:
        polygon.use_smooth = polygon.area < max(size) * min(size) * 0.30
    return _finish_piece(obj, collection, material, bone, pieces)


def _sphere(name, centre, size, material, bone, collection, pieces, segments=12, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1, location=centre)
    obj = bpy.context.object
    obj.name = name
    obj.scale = Vector(size) * 0.5
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return _finish_piece(obj, collection, material, bone, pieces)


def _ring_mesh(name, rings, material, bone, collection, pieces):
    """Capped ordered rings; coherent UVs cover side walls and both end caps."""
    side_count = len(rings[0])
    vertices = [tuple(point) for ring in rings for point in ring]
    faces = [tuple(reversed(range(side_count)))]
    for row in range(len(rings) - 1):
        for col in range(side_count):
            nxt = (col + 1) % side_count
            faces.append((row * side_count + col, row * side_count + nxt,
                          (row + 1) * side_count + nxt, (row + 1) * side_count + col))
    faces.append(tuple((len(rings) - 1) * side_count + col for col in range(side_count)))
    mesh = bpy.data.meshes.new(name + '_mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    uv = mesh.uv_layers.new(name='UVMap')
    for polygon in mesh.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
        columns = [mesh.loops[index].vertex_index % side_count for index in polygon.loop_indices]
        seam = 0 in columns and side_count - 1 in columns
        for loop_index in polygon.loop_indices:
            index = mesh.loops[loop_index].vertex_index
            column, row = index % side_count, index // side_count
            if len(polygon.vertices) > 4:
                angle = 2 * math.pi * column / side_count
                uv.data[loop_index].uv = (0.5 + 0.45 * math.cos(angle), 0.5 + 0.45 * math.sin(angle))
            else:
                u = 1.0 if seam and column == 0 else column / side_count
                uv.data[loop_index].uv = (u, row / (len(rings) - 1))
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    mesh.materials.append(material)
    if bone:
        obj.vertex_groups.new(name=bone).add(list(range(len(mesh.vertices))), 1.0, 'REPLACE')
    pieces.append(obj)
    return obj


def _limb(name, start, end, radii, material, bone, collection, pieces, depth=0.88):
    start, end = Vector(start), Vector(end)
    axis = (end - start).normalized()
    cross = axis.cross(Vector((0, 1, 0))).normalized()
    other = axis.cross(cross).normalized()
    rings = []
    for t, scale in ((0.0, 0.82), (0.08, 1.0), (0.92, 1.0), (1.0, 0.82)):
        radius = (radii[0] * (1 - t) + radii[1] * t) * scale
        centre = start.lerp(end, t)
        rings.append([centre + radius * (math.cos(i * math.tau / 12) * cross +
                      math.sin(i * math.tau / 12) * depth * other) for i in range(12)])
    return _ring_mesh(name, rings, material, bone, collection, pieces)


def _torso(name, sections, material, collection, pieces, scale=1.0, rigid_bone=None):
    rings = []
    # Rounded rectangles keep broad front/back panels and realistic shoulders.
    for z, width, depth in sections:
        corners = []
        radius = min(width, depth) * 0.25
        for xsign, ysign, angle in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
            centre = Vector((xsign * (width / 2 - radius), ysign * (depth / 2 - radius), z))
            for offset in (0, 45, 90):
                a = math.radians(angle + offset)
                corners.append((centre + Vector((radius * math.cos(a), radius * math.sin(a), 0))) * scale)
        rings.append(corners)
    obj = _ring_mesh(name, rings, material, rigid_bone, collection, pieces)
    if rigid_bone is None:
        groups = {bone: obj.vertex_groups.new(name=bone) for bone in ('hips', 'spine', 'chest')}
        for vertex in obj.data.vertices:
            z = vertex.co.z / scale
            if z <= 1.12:
                blend = max(0.0, min(1.0, (z - 1.00) / 0.12))
                weights = {'hips': 1 - blend, 'spine': blend}
            else:
                blend = max(0.0, min(1.0, (z - 1.17) / 0.18))
                weights = {'spine': 1 - blend, 'chest': blend}
            for bone, weight in weights.items():
                if weight > 0:
                    groups[bone].add([vertex.index], weight, 'REPLACE')
    return obj


def _armature(name, collection, scale):
    data = bpy.data.armatures.new(name + '_skeleton')
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    definitions = [
        ('hips', (0, 0, .95), (0, 0, 1.055), None, False),
        ('spine', (0, 0, 1.055), (0, 0, 1.255), 'hips', True),
        ('chest', (0, 0, 1.255), (0, 0, 1.43), 'spine', True),
        ('neck', (0, 0, 1.43), (0, 0, 1.515), 'chest', True),
        ('head', (0, 0, 1.515), (0, 0, 1.775), 'neck', True),
    ]
    for suffix, sign in (('L', 1), ('R', -1)):
        definitions.extend([
            ('shoulder.' + suffix, (sign * .025, 0, 1.395), (sign * .215, 0, 1.39), 'chest', False),
            ('upper_arm.' + suffix, (sign * .215, 0, 1.39), (sign * .300, 0, 1.155), 'shoulder.' + suffix, True),
            ('forearm.' + suffix, (sign * .300, 0, 1.155), (sign * .335, -.005, .96), 'upper_arm.' + suffix, True),
            ('hand.' + suffix, (sign * .335, -.005, .96), (sign * .345, -.015, .87), 'forearm.' + suffix, True),
            ('thigh.' + suffix, (sign * .100, 0, .95), (sign * .100, 0, .52), 'hips', False),
            ('shin.' + suffix, (sign * .100, 0, .52), (sign * .100, 0, .13), 'thigh.' + suffix, True),
            ('foot.' + suffix, (sign * .100, 0, .13), (sign * .100, -.16, .075), 'shin.' + suffix, True),
            ('toe.' + suffix, (sign * .100, -.16, .075), (sign * .100, -.235, .075), 'foot.' + suffix, True),
        ])
    for bone_name, head, tail, parent, connect in definitions:
        bone = data.edit_bones.new(bone_name)
        bone.head, bone.tail = Vector(head) * scale, Vector(tail) * scale
        if parent:
            bone.parent = data.edit_bones[parent]
            bone.use_connect = connect
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.show_in_front = True
    obj['asset_type'] = 'humanoid_avatar'
    obj['forward_axis'] = '-Y in Blender; +Z in GLB'
    obj['units'] = 'metres'
    obj['rig_notes'] = '21 bones; hips root; left/right limbs; in-place looping idle, walk, run'
    return obj


def _rotate(pose_bone, angle, world_axis=(1, 0, 0)):
    axis = pose_bone.bone.matrix_local.to_quaternion().inverted() @ Vector(world_axis)
    pose_bone.rotation_quaternion = Quaternion(axis, angle)


def _animate(armature, scale):
    """Baked FK at 30 fps. Opposed limbs, cancelling foot pitch, grounded stance."""
    scene = bpy.context.scene
    scene.render.fps = 30
    animation = armature.animation_data_create()
    offsets = {'idle': 1, 'walk': 121, 'run': 181}
    durations = {'idle': 90, 'walk': 36, 'run': 24}
    for clip in ('idle', 'walk', 'run'):
        action = bpy.data.actions.new(armature.name + '_' + clip)
        animation.action = action
        action.use_fake_user = True
        start, duration = offsets[clip], durations[clip]
        for frame in range(start, start + duration + 1, 2):
            phase = (frame - start) / duration * math.tau
            for bone in armature.pose.bones:
                bone.rotation_mode = 'QUATERNION'
                bone.rotation_quaternion = (1, 0, 0, 0)
                bone.location = (0, 0, 0)
            if clip == 'idle':
                _rotate(armature.pose.bones['chest'], .012 * math.sin(phase))
                _rotate(armature.pose.bones['head'], -.008 * math.sin(phase), (0, 0, 1))
                for suffix in ('L', 'R'):
                    _rotate(armature.pose.bones['forearm.' + suffix], -.075 + .01 * math.sin(phase))
            else:
                running = clip == 'run'
                amplitude, knee_amplitude = (.56, 1.02) if running else (.34, .65)
                stance_angle = 0.0
                for suffix, shift in (('L', 0), ('R', math.pi)):
                    p = phase + shift
                    thigh = -amplitude * math.sin(p)
                    knee = knee_amplitude * max(0.0, math.cos(p))
                    _rotate(armature.pose.bones['thigh.' + suffix], thigh)
                    _rotate(armature.pose.bones['shin.' + suffix], knee)
                    _rotate(armature.pose.bones['foot.' + suffix], -(thigh + knee))
                    _rotate(armature.pose.bones['upper_arm.' + suffix], -thigh * (1.00 if running else .80))
                    _rotate(armature.pose.bones['forearm.' + suffix], -(.95 if running else .20))
                    if math.cos(p) <= 1e-6:
                        stance_angle = thigh
                # Support foot stays on the floor across the straight-leg stance.
                height_offset = -.82 * (1 - math.cos(stance_angle)) * scale
                if running:
                    height_offset += .025 * abs(math.cos(phase)) * scale
                root = armature.pose.bones['hips']
                root.location = root.bone.matrix_local.to_quaternion().inverted() @ Vector((0, 0, height_offset))
                _rotate(armature.pose.bones['chest'], -.04 if running else -.012)
                _rotate(armature.pose.bones['head'], .04 if running else .012)
            for bone in armature.pose.bones:
                bone.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=bone.name)
            armature.pose.bones['hips'].keyframe_insert(data_path='location', frame=frame, group='hips')
        track = animation.nla_tracks.new()
        track.name = clip
        strip = track.strips.new(clip, start, action)
        strip.extrapolation = 'NOTHING'
        strip.blend_type = 'REPLACE'
        # Blender 4.4+ actions have slots. Explicit assignment avoids empty GLB clips.
        if hasattr(action, 'slots') and action.slots and hasattr(strip, 'action_slot'):
            strip.action_slot = action.slots[0]
        animation.action = None
    scene.frame_set(1)
    return ['idle', 'walk', 'run']


def _ground_walk(armature, mesh_obj):
    """Bake exact support height at every walk frame using the skinned surface.

    Rounded shoe geometry and the slightly diagonal foot bone make the analytic
    gait height only approximate. Evaluated vertices provide the exported skin's
    actual lowest point, including interpolation between the original FK keys.
    This can also be called on an already-built avatar before re-exporting it.
    """
    scene = bpy.context.scene
    animation = armature.animation_data
    if animation is None:
        raise ValueError('Avatar has no animation data')
    walk_track = next((track for track in animation.nla_tracks if track.name == 'walk'), None)
    if walk_track is None or len(walk_track.strips) != 1:
        raise ValueError('Avatar must have one walk NLA strip')
    strip = walk_track.strips[0]
    action = strip.action
    hips = armature.pose.bones['hips']
    world_to_root = (hips.bone.matrix_local.to_3x3().inverted() @
                     armature.matrix_world.to_3x3().inverted())
    start, end = int(round(strip.action_frame_start)), int(round(strip.action_frame_end))
    corrections = []
    try:
        for track in animation.nla_tracks:
            track.mute = True
        animation.action = action
        if hasattr(strip, 'action_slot') and strip.action_slot is not None:
            animation.action_slot = strip.action_slot
        for frame in range(start, end + 1):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            evaluated = mesh_obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
            surface = evaluated.to_mesh()
            try:
                lowest = min((evaluated.matrix_world @ vertex.co).z for vertex in surface.vertices)
            finally:
                evaluated.to_mesh_clear()
            hips.location += world_to_root @ Vector((0, 0, -lowest))
            hips.keyframe_insert(data_path='location', frame=frame, group='hips')
            corrections.append(-lowest)
    finally:
        animation.action = None
        for track in animation.nla_tracks:
            track.mute = False
        scene.frame_set(1)
        bpy.context.view_layer.update()
    return {'frames': len(corrections), 'largest_correction_m': max(map(abs, corrections), default=0.0)}


def _animate_seating(armature, scale):
    """Seat the adult rig without scaling it or introducing horizontal root motion.

    The pelvis underside rests at .46 m. The slightly descending thighs keep
    the original ankle height and flat soles. Other furniture profiles may
    translate the visual root vertically by seat_surface_height - .46 m.
    NLA ranges are disjoint from locomotion and each export starts at zero.
    """
    scene = bpy.context.scene
    animation = armature.animation_data_create()
    lowering = SEATED_SURFACE_HEIGHT - .855 * scale
    hips_height = .95 * scale + lowering
    # Keep ankle/sole height unchanged while hips move onto the cushion.
    knee_drop = hips_height - .52 * scale
    thigh_angle = -math.acos(knee_drop / (.43 * scale))
    seated_ankle_forward = -.43 * scale * math.sin(thigh_angle)
    armature['seated_surface_height_m'] = SEATED_SURFACE_HEIGHT
    armature['seated_hips_height_m'] = hips_height
    armature['seated_hips_lowering_m'] = lowering
    armature['seating_transition_seconds'] = SEATING_TRANSITION_FRAMES / 30
    armature['rig_notes'] = '21 bones; hips root; in-place idle/walk/run and sit_down/seated_idle/stand_up'
    clips = [('sit_down', 241, SEATING_TRANSITION_FRAMES), ('seated_idle', 301, 90),
             ('stand_up', 421, SEATING_TRANSITION_FRAMES)]
    for clip, start, duration in clips:
        action = bpy.data.actions.new(armature.name + '_' + clip)
        action.use_fake_user = True
        animation.action = action
        for frame in range(start, start + duration + 1):
            t = (frame - start) / duration
            amount = t * t * (3 - 2 * t)
            if clip == 'stand_up':
                amount = 1 - amount
            if clip == 'seated_idle':
                amount = 1
            breath = math.sin(t * math.tau) if clip == 'seated_idle' else 0
            for bone in armature.pose.bones:
                bone.rotation_mode = 'QUATERNION'
                bone.rotation_quaternion = (1, 0, 0, 0)
                bone.location = (0, 0, 0)
            root = armature.pose.bones['hips']
            root.location = root.bone.matrix_local.to_quaternion().inverted() @ Vector((0, 0, lowering * amount))
            lean = .14 * math.sin(math.pi * amount) + .035 * amount + .006 * breath
            _rotate(armature.pose.bones['chest'], lean)
            _rotate(armature.pose.bones['head'], -.8 * lean)
            # Bake a two-link leg solve. Interpolating FK alone makes shoes dip
            # through the floor halfway through a sit; these fixed-height ankle
            # targets preserve floor contact while the pelvis lowers.
            thigh_length, shin_length = .43 * scale, .39 * scale
            ankle_forward = seated_ankle_forward * amount
            hip_to_ankle = .82 * scale + lowering * amount
            reach = math.hypot(ankle_forward, hip_to_ankle)
            bend = math.acos(max(-1, min(1, (thigh_length ** 2 + reach ** 2 - shin_length ** 2) / (2 * thigh_length * reach))))
            upper_angle = -math.atan2(ankle_forward, hip_to_ankle) - bend
            knee_forward = -thigh_length * math.sin(upper_angle)
            knee_above_ankle = hip_to_ankle - thigh_length * math.cos(upper_angle)
            lower_angle = math.atan2(knee_forward - ankle_forward, knee_above_ankle)
            for suffix, sign in (('L', 1), ('R', -1)):
                _rotate(armature.pose.bones['thigh.' + suffix], upper_angle)
                _rotate(armature.pose.bones['shin.' + suffix], lower_angle - upper_angle)
                _rotate(armature.pose.bones['foot.' + suffix], -lower_angle)
                upper = armature.pose.bones['upper_arm.' + suffix]
                _rotate(upper, -.28 * amount)
                inward_axis = upper.bone.matrix_local.to_quaternion().inverted() @ Vector((0, 1, 0))
                upper.rotation_quaternion = Quaternion(inward_axis, sign * .30 * amount) @ upper.rotation_quaternion
                _rotate(armature.pose.bones['forearm.' + suffix], -.075 - .275 * amount)
            for bone in armature.pose.bones:
                bone.keyframe_insert(data_path='rotation_quaternion', frame=frame, group=bone.name)
            root.keyframe_insert(data_path='location', frame=frame, group='hips')
        track = animation.nla_tracks.new()
        track.name = clip
        strip = track.strips.new(clip, start, action)
        strip.extrapolation = 'NOTHING'
        strip.blend_type = 'REPLACE'
        if hasattr(action, 'slots') and action.slots and hasattr(strip, 'action_slot'):
            strip.action_slot = action.slots[0]
        animation.action = None
    scene.frame_set(1)
    return [name for name, _, _ in clips]


def build_avatar(name, variant, collection, palette):
    if variant not in ('casual', 'sporty', 'stylized'):
        raise ValueError('variant must be casual, sporty or stylized')
    scale = {'casual': .99, 'sporty': 1.0, 'stylized': .94}[variant]
    pieces = []
    skin_colors = {'casual': (.63, .41, .285), 'sporty': (.31, .17, .105), 'stylized': (.76, .57, .40)}
    skin = _material('avatar_skin_' + variant, skin_colors[variant])
    shirt = _material('avatar_top_' + variant, {'casual': (.40, .46, .37), 'sporty': (.235, .32, .40), 'stylized': (.54, .49, .40)}[variant])
    trousers = _material('avatar_trousers_' + variant, {'casual': (.18, .21, .24), 'sporty': (.11, .14, .17), 'stylized': (.26, .29, .28)}[variant])
    hair = _material('avatar_hair_' + variant, {'casual': (.075, .045, .025), 'sporty': (.028, .024, .020), 'stylized': (.20, .105, .045)}[variant])
    dark = palette.get('dark') or _material('avatar_dark', (.024, .028, .032))
    white = _material('avatar_warm_white', (.84, .82, .76))
    sole = _material('avatar_shoe_sole', (.45, .46, .43))
    eye = _material('avatar_eye', (.016, .012, .009), .40)
    armature = _armature(name, collection, scale)
    pt = lambda value: Vector(value) * scale
    sz = lambda value: tuple(component * scale for component in value)

    def box(part, centre, size, mat, bone, bevel=.012):
        return _box(name + '_' + part, pt(centre), sz(size), mat, bone, collection, pieces, bevel * scale)

    def sphere(part, centre, size, mat, bone, segments=12, rings=8):
        return _sphere(name + '_' + part, pt(centre), sz(size), mat, bone, collection, pieces, segments, rings)

    def limb(part, start, end, radii, mat, bone, depth=.88):
        return _limb(name + '_' + part, pt(start), pt(end), tuple(r * scale for r in radii), mat, bone, collection, pieces, depth)

    _torso(name + '_pelvis', [(.855, .29, .205), (.92, .335, .225), (1.05, .315, .22)], trousers, collection, pieces, scale, 'hips')
    _torso(name + '_shirt', [(1.015, .326, .232), (1.13, .337, .23), (1.32, .408, .238), (1.405, .425, .23), (1.445, .335, .205)], shirt, collection, pieces, scale)
    limb('neck', (0, 0, 1.415), (0, 0, 1.535), (.062, .063), skin, 'neck', 1)
    # A small collar makes the head-to-shirt transition read as clothing.
    box('collar', (0, -.091, 1.435), (.15, .028, .035), dark if variant == 'sporty' else shirt, 'chest', .008)
    head_size = (.26, .225, .30) if variant == 'stylized' else (.225, .21, .285)
    head_z = 1.625
    box('head', (0, -.009, head_z), head_size, skin, 'head', .046)
    half_width = head_size[0] / 2
    face_y = -.009 - head_size[1] / 2
    sphere('nose', (0, face_y - .008, 1.625), (.046, .043, .058), skin, 'head', 10, 6)
    for suffix, sign in (('L', 1), ('R', -1)):
        sphere('ear_' + suffix, (sign * half_width, 0, 1.627), (.035, .057, .068), skin, 'head', 10, 6)
        sphere('eye_' + suffix, (sign * .043, face_y - .003, 1.664), (.030, .015, .021), eye, 'head', 10, 6)
        box('brow_' + suffix, (sign * .043, face_y + .001, 1.692), (.039, .014, .009), hair, 'head', .002)
    box('mouth', (0, face_y - .003, 1.582), (.048, .012, .008), _material('avatar_lip', (.28, .15, .105)), 'head', .002)
    hair_top = 1.738 if variant == 'sporty' else 1.750
    box('hair_cap', (0, .005, hair_top), (head_size[0] * 1.035, head_size[1] * 1.02, .080 if variant == 'sporty' else .094), hair, 'head', .025)
    box('hair_back', (0, .081, 1.682), (head_size[0] * .94, .062, .156), hair, 'head', .018)
    if variant != 'sporty':
        box('hair_fringe', (-.038, face_y + .018, 1.723), (head_size[0] * .60, .050, .048), hair, 'head', .012)

    for suffix, sign in (('L', 1), ('R', -1)):
        shoulder = (sign * .215, 0, 1.39)
        elbow = (sign * .300, 0, 1.155)
        wrist = (sign * .335, -.005, .96)
        upper_bone, lower_bone = 'upper_arm.' + suffix, 'forearm.' + suffix
        sphere('shoulder_' + suffix, shoulder, (.142, .142, .142), shirt, upper_bone)
        if variant == 'casual':
            middle = Vector(shoulder).lerp(Vector(elbow), .52)
            limb('sleeve_' + suffix, shoulder, middle, (.073, .066), shirt, upper_bone)
            limb('upper_arm_' + suffix, middle, elbow, (.053, .046), skin, upper_bone)
            sphere('elbow_' + suffix, elbow, (.088, .082, .088), skin, lower_bone)
            limb('forearm_' + suffix, elbow, wrist, (.048, .034), skin, lower_bone)
        else:
            limb('sleeve_' + suffix, shoulder, elbow, (.071, .052), shirt, upper_bone)
            sphere('elbow_' + suffix, elbow, (.100, .092, .10), shirt, lower_bone)
            limb('forearm_' + suffix, elbow, wrist, (.052, .035), shirt, lower_bone)
        sphere('hand_' + suffix, (sign * .345, -.011, .914), (.072, .066, .115), skin, 'hand.' + suffix)
        sphere('thumb_' + suffix, (sign * .313, -.028, .927), (.033, .039, .060), skin, 'hand.' + suffix, 10, 6)
        thigh, knee, ankle = (sign * .100, 0, .95), (sign * .100, 0, .52), (sign * .100, 0, .13)
        limb('thigh_' + suffix, thigh, knee, (.085, .065), trousers, 'thigh.' + suffix)
        sphere('knee_' + suffix, knee, (.127, .120, .125), trousers, 'shin.' + suffix)
        limb('shin_' + suffix, knee, ankle, (.065, .045), trousers, 'shin.' + suffix)
        box('shoe_' + suffix, (sign * .100, -.072, .072), (.137, .276, .132), dark, 'foot.' + suffix, .027)
        box('sole_' + suffix, (sign * .100, -.076, .019), (.142, .284, .038), sole if variant == 'casual' else white, 'foot.' + suffix, .009)
        if variant == 'sporty':
            # Small solid-color panels give a sportswear identity without logos.
            limb('sleeve_panel_' + suffix, (sign * .250, -.057, 1.35), (sign * .312, -.048, 1.17), (.012, .010), white, upper_bone, .4)
            limb('trouser_panel_' + suffix, (sign * .177, 0, .90), (sign * .158, 0, .56), (.010, .009), white, 'thigh.' + suffix, .4)
            box('shoe_toe_' + suffix, (sign * .100, -.173, .075), (.125, .054, .053), white, 'foot.' + suffix, .012)
        elif variant == 'casual':
            box('shoe_vamp_' + suffix, (sign * .100, -.075, .132), (.092, .083, .012), shirt, 'foot.' + suffix, .003)
    if variant == 'sporty':
        box('zipper', (0, -.120, 1.285), (.007, .009, .249), white, 'chest', .001)
    elif variant == 'casual':
        box('shirt_pocket', (-.10, -.123, 1.313), (.07, .014, .076), shirt, 'chest', .005)
    else:
        box('sweater_band', (0, -.118, 1.075), (.29, .014, .030), trousers, 'spine', .004)

    bpy.ops.object.select_all(action='DESELECT')
    for obj in pieces:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    mesh_obj = bpy.context.object
    mesh_obj.name = name + '_mesh'
    # Bake all mesh object transforms; armature and mesh origins are the floor.
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    modifier = mesh_obj.modifiers.new('Humanoid skin', 'ARMATURE')
    modifier.object = armature
    modifier.use_deform_preserve_volume = False
    mesh_obj.parent = armature
    mesh_obj.matrix_parent_inverse.identity()
    mesh_obj['variant'] = variant
    mesh_obj['uv_notes'] = 'UVMap on all surfaces; solid-color materials need no textures'
    animations = _animate(armature, scale)
    _ground_walk(armature, mesh_obj)
    if variant == 'casual':
        animations += _animate_seating(armature, scale)
    bpy.context.view_layer.update()
    return {
        'root': armature,
        'objects': [armature, mesh_obj],
        'animations': animations,
        'description': {
            'casual': 'Neutral casual humanoid, sage short-sleeved shirt, charcoal trousers and simple sneakers.',
            'sporty': 'Neutral athletic humanoid, slate tracksuit with unbranded pale panels and sneakers.',
            'stylized': 'Generic humanoid with a slightly larger head, warm-neutral sweater and charcoal trousers.',
        }[variant],
    }

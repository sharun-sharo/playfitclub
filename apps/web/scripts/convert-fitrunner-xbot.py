"""Merge the six Mixamo X Bot FBX clips into one skinned GLB.

Do not run this over apps/web/public/assets/fitrunner/xbot.glb.
strip_ground_motion freezes hip travel and the 0.01 armature scale tears
the mesh in float32 skinning. The shipped GLB is produced by
apps/web/scripts/bake-fitrunner-skeleton.mjs.
"""

import math
import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
GAME = os.path.join(ROOT, "game")
OUT = os.path.join(ROOT, "apps", "web", "public", "assets", "fitrunner", "xbot.glb")

CLIPS = [
    ("Running.fbx", "Run"),
    ("Jumping Up.fbx", "JumpUp"),
    ("Sprinting Forward Roll.fbx", "ForwardRoll"),
    ("Jumping.fbx", "LongJump"),
    ("Standing Up.fbx", "StandUp"),
    ("Wiping Sweat.fbx", "WipeSweat"),
]

HIPS = "mixamorig:Hips"
HIPS_PATH = f'pose.bones["{HIPS}"].location'
# Vertical travel above this is root motion (jump/roll), not a run bob.
VERTICAL_ROOT_LIMIT = 0.25


def fail(message):
    print(f"FITRUNNER_CONVERT_FAIL {message}", flush=True)
    sys.exit(1)


def set_action(arm, action):
    if arm.animation_data is None:
        arm.animation_data_create()
    arm.animation_data.action = action
    slots = [slot for slot in action.slots if slot.target_id_type == "OBJECT"]
    if not slots:
        fail(f"{action.name} has no object action slot")
    arm.animation_data.action_slot = slots[0]


def hips_fcurves(action):
    curves = {}
    fcurves = getattr(action, "fcurves", None)
    if not fcurves:
        fail(f"{action.name} has no fcurves")
    for curve in fcurves:
        if curve.data_path == HIPS_PATH:
            curves[curve.array_index] = curve
    if sorted(curves) != [0, 1, 2]:
        fail(f"{action.name} is missing Hips location curves: {sorted(curves)}")
    return curves


def import_clip(filename, clip_name, keep_rig):
    path = os.path.join(GAME, filename)
    if not os.path.isfile(path):
        fail(f"missing {path}")
    before_objects = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, use_anim=True)
    new_objects = [obj for obj in bpy.data.objects if obj not in before_objects]
    armatures = [obj for obj in new_objects if obj.type == "ARMATURE"]
    if len(armatures) != 1:
        fail(f"{filename} imported {len(armatures)} armatures")
    arm = armatures[0]
    if arm.animation_data is None or arm.animation_data.action is None:
        fail(f"{filename} has no armature action")
    action = arm.animation_data.action
    if "mixamo.com" not in action.name:
        fail(f"{filename} action is {action.name!r}, expected the mixamo.com stack")
    if "Take 001" in action.name:
        fail(f"{filename} selected Take 001")
    action.name = clip_name
    action.use_fake_user = True
    surfaces = [obj for obj in new_objects if obj.type == "MESH" and "Surface" in obj.name]
    joints = [obj for obj in new_objects if obj.type == "MESH" and "Joints" in obj.name]
    if keep_rig:
        if len(surfaces) != 1:
            fail(f"{filename} expected one Beta_Surface, found {len(surfaces)}")
        for joint in joints:
            bpy.data.objects.remove(joint, do_unlink=True)
        return arm, surfaces[0]
    for obj in new_objects:
        bpy.data.objects.remove(obj, do_unlink=True)
    return None, None


def strip_ground_motion(arm, action):
    """Cancel Hips world translation on the ground plane.

    Large vertical travel is removed too, so jump and roll clips do not add a
    second root hop on top of the gameplay arc. Small vertical bob stays.
    """
    set_action(arm, action)
    scene = bpy.context.scene
    start = int(round(action.frame_range[0]))
    end = int(round(action.frame_range[1]))
    hips = arm.pose.bones[HIPS]
    scene.frame_set(start)
    bpy.context.view_layer.update()
    origin = (arm.matrix_world @ hips.matrix).translation.copy()
    samples = []
    max_xy = 0.0
    max_z = 0.0
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        world = (arm.matrix_world @ hips.matrix).translation.copy()
        delta = world - origin
        max_xy = max(max_xy, math.hypot(delta.x, delta.y))
        max_z = max(max_z, abs(delta.z))
        samples.append((frame, hips.location.copy(), delta))

    drop_vertical = max_z > VERTICAL_ROOT_LIMIT
    curves = hips_fcurves(action)
    corrected = {}
    for frame, location, delta in samples:
        cancel = delta.copy()
        if not drop_vertical:
            cancel.z = 0.0
        if cancel.length > 1e-8:
            delta_arm = arm.matrix_world.inverted().to_3x3() @ cancel
            delta_local = hips.bone.matrix_local.to_3x3().inverted() @ delta_arm
            location = location - delta_local
        corrected[frame] = location

    for index, curve in curves.items():
        for key in curve.keyframe_points:
            frame = int(round(key.co[0]))
            if frame not in corrected:
                continue
            key.co[1] = corrected[frame][index]
            key.handle_left[1] = corrected[frame][index]
            key.handle_right[1] = corrected[frame][index]
        curve.update()

    # Re-measure after the curves are rewritten.
    scene.frame_set(start)
    bpy.context.view_layer.update()
    origin = (arm.matrix_world @ hips.matrix).translation.copy()
    remain_xy = 0.0
    remain_z = 0.0
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        world = (arm.matrix_world @ hips.matrix).translation.copy()
        delta = world - origin
        remain_xy = max(remain_xy, math.hypot(delta.x, delta.y))
        remain_z = max(remain_z, abs(delta.z))
    print(
        f"CLIP {action.name} frames={start}-{end} "
        f"fps={scene.render.fps}/{scene.render.fps_base} "
        f"before_xy={max_xy:.4f} before_z={max_z:.4f} drop_vertical={drop_vertical} "
        f"after_xy={remain_xy:.4f} after_z={remain_z:.4f}",
        flush=True,
    )
    if remain_xy > 0.05:
        fail(f"{action.name} still drifts {remain_xy:.3f} m on the ground plane")


def mesh_height(arm, mesh):
    bpy.context.view_layer.update()
    zs = [(mesh.matrix_world @ vertex.co).z for vertex in mesh.data.vertices]
    return max(zs) - min(zs)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    arm = None
    mesh = None
    for index, (filename, clip_name) in enumerate(CLIPS):
        imported_arm, imported_mesh = import_clip(filename, clip_name, keep_rig=index == 0)
        if index == 0:
            arm = imported_arm
            mesh = imported_mesh

    if arm is None or mesh is None:
        fail("base rig missing")

    names = [action.name for action in bpy.data.actions]
    expected = [clip_name for _, clip_name in CLIPS]
    if names != expected and sorted(names) != sorted(expected):
        fail(f"unexpected actions {names}")
    for action in bpy.data.actions:
        if "Take 001" in action.name or "Beta_Joints" in action.name:
            fail(f"unexpected action {action.name}")

    bone_count = len(arm.data.bones)
    if bone_count != 65:
        fail(f"expected 65 bones, found {bone_count}")
    if HIPS not in arm.pose.bones:
        fail("mixamorig:Hips missing")

    joints = [obj.name for obj in bpy.data.objects if "Joints" in obj.name]
    if joints:
        fail(f"Beta_Joints still present: {joints}")
    surfaces = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    if len(surfaces) != 1 or "Surface" not in surfaces[0].name:
        fail(f"expected one Beta_Surface, found {[obj.name for obj in surfaces]}")

    height = mesh_height(arm, mesh)
    print(f"HEIGHT_BEFORE {height:.4f} armature_scale={tuple(round(v, 6) for v in arm.scale)}", flush=True)
    if height > 10:
        factor = 1.81 / height
        arm.scale = tuple(value * factor for value in arm.scale)
        bpy.context.view_layer.update()
        height = mesh_height(arm, mesh)
        print(f"HEIGHT_SCALED {height:.4f}", flush=True)
    if not 1.7 <= height <= 1.95:
        fail(f"character height {height:.3f} m is outside 1.70-1.95")

    bpy.context.view_layer.objects.active = arm
    for action in bpy.data.actions:
        strip_ground_motion(arm, action)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format="GLB",
        use_selection=True,
        export_apply=False,
        export_skins=True,
        export_morph=False,
        export_lights=False,
        export_cameras=False,
        export_yup=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_anim_single_armature=True,
        export_reset_pose_bones=True,
        export_anim_slide_to_zero=True,
        export_frame_range=False,
        export_leaf_bone=False,
        export_def_bones=False,
        export_optimize_animation_size=False,
    )
    print(f"WROTE {OUT} bytes={os.path.getsize(OUT)}", flush=True)


if __name__ == "__main__":
    main()

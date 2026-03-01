import * as THREE from 'three';

/**
 * Maps DeepMotion bone names to Blender metarig bone names.
 * DeepMotion uses "_JNT" suffix with l_/r_ prefix convention.
 * The ronin FBX uses Blender metarig naming (spine, upper_arm.R, etc.)
 */
const BONE_NAME_MAP = {
  'hips_JNT':       'spine',
  'spine_JNT':      'spine.001',
  'spine1_JNT':     'spine.002',
  'spine2_JNT':     'spine.003',
  'neck_JNT':       'Neck',
  'head_JNT':       'Head',

  'l_shoulder_JNT': null,        // no equivalent — skip
  'l_arm_JNT':      'upper_arm.L',
  'l_forearm_JNT':  'forearm.L',
  'l_hand_JNT':     'hand.L',

  'r_shoulder_JNT': null,
  'r_arm_JNT':      'upper_arm.R',
  'r_forearm_JNT':  'forearm.R',
  'r_hand_JNT':     'hand.R',

  'l_upleg_JNT':    'thigh.L',
  'l_leg_JNT':      'shin.L',
  'l_foot_JNT':     'foot.L',
  'l_toebase_JNT':  'toe.L',

  'r_upleg_JNT':    'thigh.R',
  'r_leg_JNT':      'shin.R',
  'r_foot_JNT':     'foot.R',
  'r_toebase_JNT':  'toe.R',
};

// Finger mappings (if the target skeleton has them)
const FINGER_MAP = {
  'l_handThumb1_JNT': 'thumb.01.L', 'l_handThumb2_JNT': 'thumb.02.L', 'l_handThumb3_JNT': 'thumb.03.L',
  'l_handIndex1_JNT': 'f_index.01.L', 'l_handIndex2_JNT': 'f_index.02.L', 'l_handIndex3_JNT': 'f_index.03.L',
  'l_handMiddle1_JNT': 'f_middle.01.L', 'l_handMiddle2_JNT': 'f_middle.02.L', 'l_handMiddle3_JNT': 'f_middle.03.L',
  'l_handRing1_JNT': 'f_ring.01.L', 'l_handRing2_JNT': 'f_ring.02.L', 'l_handRing3_JNT': 'f_ring.03.L',
  'l_handPinky1_JNT': 'f_pinky.01.L', 'l_handPinky2_JNT': 'f_pinky.02.L', 'l_handPinky3_JNT': 'f_pinky.03.L',
  'r_handThumb1_JNT': 'thumb.01.R', 'r_handThumb2_JNT': 'thumb.02.R', 'r_handThumb3_JNT': 'thumb.03.R',
  'r_handIndex1_JNT': 'f_index.01.R', 'r_handIndex2_JNT': 'f_index.02.R', 'r_handIndex3_JNT': 'f_index.03.R',
  'r_handMiddle1_JNT': 'f_middle.01.R', 'r_handMiddle2_JNT': 'f_middle.02.R', 'r_handMiddle3_JNT': 'f_middle.03.R',
  'r_handRing1_JNT': 'f_ring.01.R', 'r_handRing2_JNT': 'f_ring.02.R', 'r_handRing3_JNT': 'f_ring.03.R',
  'r_handPinky1_JNT': 'f_pinky.01.R', 'r_handPinky2_JNT': 'f_pinky.02.R', 'r_handPinky3_JNT': 'f_pinky.03.R',
};

const FULL_MAP = { ...BONE_NAME_MAP, ...FINGER_MAP };

/**
 * Retarget animation clips from DeepMotion skeleton to the ronin FBX skeleton.
 * Creates new AnimationClip(s) with track names remapped.
 */
export function retargetAnimations(sourceClips, targetSkeleton) {
  // Build a set of bone names in the target skeleton for validation
  const targetBoneNames = new Set();
  if (targetSkeleton) {
    targetSkeleton.traverse((child) => {
      if (child.isBone) targetBoneNames.add(child.name);
    });
  }

  console.log('Target skeleton bones:', [...targetBoneNames]);

  const retargetedClips = [];

  for (const clip of sourceClips) {
    const newTracks = [];

    for (const track of clip.tracks) {
      // Track names are like "boneName.position" or "boneName.quaternion"
      const parts = track.name.split('.');
      // The bone name might contain dots, so we need the last part as property
      const property = parts.pop(); // "position", "quaternion", "scale"
      const sourceBone = parts.join('.');

      const targetBone = FULL_MAP[sourceBone];

      // Skip unmapped bones (null = intentionally skipped, undefined = unknown)
      if (targetBone === null) continue;
      if (targetBone === undefined) {
        // Not in our map — skip silently
        continue;
      }

      // Check if target skeleton actually has this bone
      if (targetBoneNames.size > 0 && !targetBoneNames.has(targetBone)) {
        continue;
      }

      // Create a new track with the remapped name
      const newName = targetBone + '.' + property;
      const newTrack = track.clone();
      newTrack.name = newName;
      newTracks.push(newTrack);
    }

    if (newTracks.length > 0) {
      const newClip = new THREE.AnimationClip(clip.name, clip.duration, newTracks);
      retargetedClips.push(newClip);
      console.log(`Retargeted "${clip.name}": ${clip.tracks.length} tracks -> ${newTracks.length} tracks`);
    }
  }

  return retargetedClips;
}

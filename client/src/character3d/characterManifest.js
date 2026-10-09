/** Shared 3D character contract. Put licensed, rigged GLB models in public/models/. */
export const CHARACTER_MANIFEST = {
  luffy: { label: 'Luffy', model: '/models/luffy.glb', aliases: ['luffy'], actions: ['Idle', 'Walk', 'Run', 'Jump', 'Climb', 'Punch', 'Kick', 'Victory'] },
  naruto: { label: 'Naruto', model: '/models/naruto.glb', aliases: ['naruto'], actions: ['Idle', 'Walk', 'Run', 'Jump', 'Climb', 'Punch', 'Kick', 'Rasengan', 'Victory'] },
  asta: { label: 'Asta', model: '/models/asta.glb', aliases: ['asta'], actions: ['Idle', 'Walk', 'Run', 'Jump', 'Climb', 'SwordSlash', 'HeavySlash', 'Victory'] },
  gojo: { label: 'Gojo', model: '/models/gojo.glb', aliases: ['gojo'], actions: ['Idle', 'Walk', 'Run', 'Jump', 'Dodge', 'Blue', 'Red', 'Victory'] },
  zoro: { label: 'Zoro', model: '/models/zoro.glb', aliases: ['zoro'], actions: ['Idle', 'Walk', 'Run', 'Jump', 'Climb', 'SwordSlash', 'ThreeSwordStyle', 'Victory'] },
  jinwoo: { label: 'Sung Jin-Woo', model: '/models/sung-jinwoo.glb', aliases: ['jinwoo', 'sung-jinwoo'], actions: ['Idle', 'Walk', 'Run', 'Jump', 'Dodge', 'DaggerSlash', 'ShadowPower', 'Victory'] },
};
export const DEFAULT_CHARACTER = 'luffy';

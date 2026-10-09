import { smoothBodyMesh } from './smoothBodyMesh.mjs';
import * as T from 'three';
import { defaultAppearance } from './creationRules.mjs';
import { raceById } from './raceCatalog.mjs';
const v = (x, y, z = 0) => new T.Vector3(x, y, z);
export function disposeObject(root) { const geometries = new Set(), materials = new Set(); root.traverse(o => { if (o instanceof T.Mesh) {
    geometries.add(o.geometry);
    for (const m of Array.isArray(o.material) ? o.material : [o.material])
        materials.add(m);
} }); for (const g of geometries)
    g.dispose(); for (const m of materials)
    m.dispose(); }
function builder(root) {
    const mesh = (geometry, material, x = 0, y = 0, z = 0, region = '') => { const m = new T.Mesh(geometry, material); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; m.userData.region = region; root.add(m); return m; };
    const oval = (x, y, z, rx, ry, rz, material, region = '') => { const m = mesh(new T.SphereGeometry(1, 32, 24), material, x, y, z, region); m.scale.set(rx, ry, rz); if (Math.min(rx, ry, rz) >= .035)
        m.userData.solid = { type: 'oval', center: new T.Vector3(x, y, z), r: new T.Vector3(rx, ry, rz), region }; return m; };
    const tube = (points, radius, material, region = '') => mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points), 32, radius, 10, false), material, 0, 0, 0, region);
    const limb = (from, to, profile, material, region = '', depth = 1) => { const direction = to.clone().sub(from), length = direction.length(); const geometry = new T.LatheGeometry(profile.map(([t, r]) => new T.Vector2(r, (t - .5) * length)), 24); const m = mesh(geometry, material, 0, 0, 0, region); m.position.copy(from.clone().add(to).multiplyScalar(.5)); m.quaternion.setFromUnitVectors(v(0, 1), direction.normalize()); m.scale.z = depth; m.userData.solid = { type: 'limb', from: from.clone(), to: to.clone(), profile, region, depth }; return m; };
    return { mesh, oval, tube, limb };
}
export function buildArtifact(item) {
    const root = new T.Group(), { mesh, oval, tube } = builder(root), metal = new T.MeshStandardMaterial({ color: item.color ?? '#baa67b', metalness: .82, roughness: .24 }), leather = new T.MeshStandardMaterial({ color: '#34292b', roughness: .85 }), inlay = new T.MeshStandardMaterial({ color: '#dfc495', metalness: .88, roughness: .28 }), crystal = new T.MeshPhysicalMaterial({ color: item.energyType === 'shadow' ? '#b295df' : '#85d7d4', emissive: item.energyType === 'shadow' ? '#4b287c' : '#146473', emissiveIntensity: .45, metalness: .2, roughness: .14, clearcoat: 1 });
    const shape = item.shape ?? 'orb';
    if (shape === 'sword' || shape === 'dagger') {
        const length = shape === 'dagger' ? .65 : 1.25, blade = new T.Shape();
        blade.moveTo(-.068, -.12);
        blade.lineTo(-.078, length - .16);
        blade.lineTo(0, length);
        blade.lineTo(.078, length - .16);
        blade.lineTo(.068, -.12);
        blade.closePath();
        const m = mesh(new T.ExtrudeGeometry(blade, { depth: .034, bevelEnabled: true, bevelThickness: .012, bevelSize: .01, bevelSegments: 2, steps: 1 }), metal, 0, 0, -.017);
        m.name = 'blade';
        mesh(new T.BoxGeometry(.46, .065, .09), inlay, 0, -.15);
        mesh(new T.CylinderGeometry(.045, .048, .35, 20), leather, 0, -.36);
        for (let n = 0; n < 7; n++)
            mesh(new T.TorusGeometry(.046, .006, 8, 24), inlay, 0, -.22 - n * .041).rotation.x = Math.PI / 2;
        oval(0, -.59, 0, .072, .062, .05, metal);
        mesh(new T.OctahedronGeometry(.038, 1), crystal, 0, -.59, .042);
        tube([v(0, -.06, .043), v(0, length - .24, .043)], .005, inlay);
    }
    else if (shape === 'staff') {
        mesh(new T.CylinderGeometry(.033, .049, 1.8, 20), leather, 0, 0);
        for (const y of [-.7, -.1, .4, .75])
            mesh(new T.CylinderGeometry(.055, .055, .05, 20), inlay, 0, y);
        mesh(new T.TorusGeometry(.22, .032, 12, 48), metal, 0, .96);
        mesh(new T.OctahedronGeometry(.13, 1), crystal, 0, .96);
        for (const side of [-1, 1])
            tube([v(side * .045, .77), v(side * .24, 1), v(side * .1, 1.22)], .02, inlay);
    }
    else if (shape === 'ring') {
        mesh(new T.TorusGeometry(.32, .055, 20, 72), metal).rotation.x = Math.PI / 2;
        mesh(new T.CylinderGeometry(.11, .14, .08, 8), inlay, 0, .06, .31);
        mesh(new T.OctahedronGeometry(.12, 0), crystal, 0, .14, .31);
        for (let n = 0; n < 12; n++) {
            const a = n * Math.PI / 6;
            oval(Math.cos(a) * .32, 0, Math.sin(a) * .32, .023, .028, .023, inlay);
        }
    }
    else if (shape === 'shield') {
        const outline = new T.Shape();
        outline.moveTo(0, .63);
        outline.quadraticCurveTo(.29, .5, .49, .42);
        outline.lineTo(.45, -.22);
        outline.quadraticCurveTo(.33, -.58, 0, -.78);
        outline.quadraticCurveTo(-.33, -.58, -.45, -.22);
        outline.lineTo(-.49, .42);
        outline.quadraticCurveTo(-.29, .5, 0, .63);
        mesh(new T.ExtrudeGeometry(outline, { depth: .055, bevelEnabled: true, bevelSize: .04, bevelThickness: .018, bevelSegments: 3 }), metal);
        tube([v(0, .59, .085), v(.45, .39, .085), v(.41, -.22, .085), v(0, -.71, .085), v(-.41, -.22, .085), v(-.45, .39, .085), v(0, .59, .085)], .012, inlay);
        oval(0, -.03, .09, .13, .17, .06, inlay);
        mesh(new T.OctahedronGeometry(.08, 1), crystal, 0, -.03, .16);
    }
    else if (shape === 'axe') {
        mesh(new T.CylinderGeometry(.044, .05, 1.5, 16), leather, 0, -.1);
        const blade = new T.Shape();
        blade.moveTo(-.06, .6);
        blade.quadraticCurveTo(.3, .7, .5, .84);
        blade.quadraticCurveTo(.62, .55, .46, .2);
        blade.quadraticCurveTo(.23, .35, -.06, .34);
        mesh(new T.ExtrudeGeometry(blade, { depth: .07, bevelEnabled: true, bevelSize: .018, bevelThickness: .01 }), metal, 0, 0, -.035);
        mesh(new T.CylinderGeometry(.066, .066, .21, 16), inlay, 0, .47);
    }
    else if (shape === 'bow') {
        tube([v(.02, -.9), v(-.27, -.47), v(-.13, 0), v(-.27, .47), v(.02, .9)], .035, leather);
        tube([v(.02, -.9), v(.06, 0), v(.02, .9)], .006, inlay);
        mesh(new T.CylinderGeometry(.044, .044, .23, 16), metal, -.13, 0);
    }
    else if (shape === 'amulet') {
        mesh(new T.TorusGeometry(.2, .022, 12, 56), inlay);
        mesh(new T.OctahedronGeometry(.18, 1), crystal);
        tube([v(-.09, .19), v(-.3, .55), v(0, .8), v(.3, .55), v(.09, .19)], .012, metal);
    }
    else if (shape === 'helmet') {
        const shell = mesh(new T.SphereGeometry(.41, 40, 28, 0, Math.PI * 2, 0, Math.PI * .72), metal, 0, 0);
        shell.scale.z = .88;
        mesh(new T.BoxGeometry(.06, .4, .055), inlay, 0, -.12, .36);
        for (const side of [-1, 1]) {
            const cheek = mesh(new T.BoxGeometry(.14, .27, .07), metal, side * .25, -.23, .27);
            cheek.rotation.z = side * .22;
        }
        tube([v(-.33, -.18, .23), v(-.35, .07, .26), v(0, .23, .38), v(.35, .07, .26), v(.33, -.18, .23)], .025, inlay);
    }
    else if (shape === 'armor') {
        const m = mesh(new T.LatheGeometry([[.28, -.55], [.38, -.38], [.31, -.08], [.43, .3], [.38, .5], [.15, .59]].map(([r, y]) => new T.Vector2(r, y)), 40), metal);
        m.scale.z = .55;
        for (const side of [-1, 1])
            oval(side * .39, .48, 0, .19, .12, .2, inlay);
        tube([v(-.3, .37, .22), v(0, .13, .24), v(.3, .37, .22)], .016, inlay);
    }
    else if (shape === 'potion') {
        mesh(new T.LatheGeometry([[.1, -.5], [.24, -.4], [.27, -.12], [.14, .18], [.06, .24], [.06, .45]].map(([r, y]) => new T.Vector2(r, y)), 40), new T.MeshPhysicalMaterial({ color: '#96b8b8', transparent: true, opacity: .42, roughness: .08, metalness: 0, depthWrite: false }));
        oval(0, -.24, 0, .235, .24, .235, crystal);
        mesh(new T.CylinderGeometry(.078, .069, .14, 16), leather, 0, .48);
        mesh(new T.TorusGeometry(.08, .012, 8, 24), inlay, 0, .35).rotation.x = Math.PI / 2;
    }
    else {
        mesh(new T.IcosahedronGeometry(.31, 3), crystal);
        for (let n = 0; n < 3; n++) {
            const ring = mesh(new T.TorusGeometry(.37, .019, 12, 72), inlay);
            ring.rotation.set(n * .7, n * .9, .3);
        }
        mesh(new T.CylinderGeometry(.2, .3, .12, 24), metal, 0, -.39);
    }
    root.scale.set(item.modelWidth ?? 1, item.modelLength ?? 1, item.modelDepth ?? 1);
    return root;
}
function wing(root, side, origin, feathers, scale, skin, bone) {
    const { limb, mesh, tube } = builder(root), region = (side > 0 ? 'left' : 'right') + 'Wing', elbow = origin.clone().add(v(side * .36 * scale, .22 * scale, -.12)), tip = origin.clone().add(v(side * .92 * scale, .49 * scale, -.18));
    const profile = [[0, .018], [.15, .034], [.6, .021], [1, .012]];
    limb(origin, elbow, profile, bone, region);
    limb(elbow, tip, profile, bone, region);
    if (feathers) {
        for (let n = 0; n < 17; n++) {
            const t = n / 16, start = elbow.clone().lerp(tip, t), end = start.clone().add(v(side * (.18 + .25 * t) * scale, -(.45 + .07 * t) * scale, -.04));
            const f = new T.Shape();
            f.moveTo(0, 0);
            f.quadraticCurveTo(.06, .16, .024, .55);
            f.quadraticCurveTo(-.02, .57, -.048, .19);
            f.quadraticCurveTo(-.04, .1, 0, 0);
            const m = mesh(new T.ExtrudeGeometry(f, { depth: .007, bevelEnabled: false, curveSegments: 10 }), skin, 0, 0, 0, region);
            m.position.copy(start);
            const d = end.sub(start);
            m.quaternion.setFromUnitVectors(v(0, 1), d.clone().normalize());
            m.scale.set(1, d.length() / .55, 1);
            tube([start, start.clone().add(d)], .0025, bone, region);
        }
    }
    else {
        const points = [origin, elbow, tip, origin.clone().add(v(side * .84 * scale, -.14 * scale, -.22)), origin.clone().add(v(side * .68 * scale, -.34 * scale, -.25)), origin.clone().add(v(side * .49 * scale, -.55 * scale, -.23)), origin.clone().add(v(side * .2 * scale, -.3 * scale, -.16))];
        const verts = [], center = elbow.clone().add(v(0, -.07, -.02));
        for (let i = 0; i < points.length; i++)
            for (const p of [center, points[i], points[(i + 1) % points.length]])
                verts.push(p.x, p.y, p.z);
        const geometry = new T.BufferGeometry();
        geometry.setAttribute('position', new T.Float32BufferAttribute(verts, 3));
        geometry.computeVertexNormals();
        mesh(geometry, skin, 0, 0, 0, region);
        for (const p of points.slice(2, 6))
            tube([elbow, elbow.clone().lerp(p, .5).add(v(0, .01, .012)), p], .009, bone, region);
    }
}
export function buildCharacter(actor) {
    const root = new T.Group(), a = { ...defaultAppearance(), ...actor.creation.appearance }, race = raceById(actor.creation.raceId, actor.creation.customRaces), form = actor.body.anatomy?.form ?? 'humanoid', { mesh, oval, tube, limb } = builder(root);
    const skin = new T.MeshPhysicalMaterial({ color: a.skin, roughness: .57, clearcoat: .12, clearcoatRoughness: .68 }), hair = new T.MeshStandardMaterial({ color: a.hair, roughness: .9 }), cloth = new T.MeshStandardMaterial({ color: a.outfit, roughness: .9 }), ivory = new T.MeshStandardMaterial({ color: '#b5a58c', roughness: .56 }), eye = new T.MeshPhysicalMaterial({ color: a.eyes, roughness: .17, clearcoat: 1 }), white = new T.MeshStandardMaterial({ color: '#d4d0c3', roughness: .25 }), dark = new T.MeshStandardMaterial({ color: '#302525', roughness: .8 }), lip = new T.MeshStandardMaterial({ color: new T.Color(a.skin).multiplyScalar(.66), roughness: .63 });
    const has = (r) => actor.body.parts[r]?.present === true;
    const segment = (p, q, r, region, material = skin) => limb(p, q, [[0, r * .75], [.08, r], [.3, r * 1.08], [.55, r * .96], [.85, r * .62], [1, r * .55]], material, region);
    const humanoid = form === 'humanoid' || form === 'winged';
    if (humanoid) {
        const shoulder = .215 * (a.shoulders ?? 1), hips = .155 * (a.hips ?? 1), waist = .138 * (a.waist ?? 1), leg = .83 * (a.legRatio ?? 1), hipY = leg + .11, neckY = hipY + .62, headY = neckY + .16, muscle = .65 + (a.musculature ?? .5) * .6;
        const torso = mesh(new T.LatheGeometry([[hips * .75, hipY - .08], [hips * 1.12, hipY], [hips * 1.12, hipY + .07], [waist, hipY + .23], [shoulder * .96 * muscle, hipY + .42], [shoulder * 1.02, hipY + .52], [shoulder * .86, hipY + .59], [.059, neckY]].map(([r, y]) => new T.Vector2(r, y)), 48), skin, 0, 0, 0, 'torso');
        torso.scale.z = .64;
        torso.userData.solid = { type: 'torso', profile: [[hipY - .08, hips * .75], [hipY, hips * 1.12], [hipY + .07, hips * 1.12], [hipY + .23, waist], [hipY + .42, shoulder * .96 * muscle], [hipY + .52, shoulder * 1.02], [hipY + .59, shoulder * .86], [neckY, .059]], depth: .64, region: 'torso' };
        segment(v(0, neckY - .015), v(0, neckY + .1), .052, 'head');
        oval(0, headY, 0, .107 * a.head, .14 * a.head, .105 * a.head, skin, 'head');
        oval(0, headY - .064, .034, .078 * (a.jaw ?? 1), .061, .069, skin, 'head');
        oval(0, headY - .023, .111, .022 * (a.nose ?? 1), .031, .03 * (a.nose ?? 1), skin, 'head');
        oval(0, headY - .065, .105, .034, .009, .012, lip, 'head');
        tube([v(-.026, headY - .065, .116), v(0, headY - .067, .12), v(.026, headY - .065, .116)], .002, dark, 'head');
        for (const side of [-1, 1]) {
            const prefix = side > 0 ? 'left' : 'right', shoulderP = v(side * (shoulder + .018), hipY + .53), elbow = v(side * (shoulder + .088), hipY + .25, .012), wrist = v(side * (shoulder + .13), hipY + .02, .017);
            oval(side * .043, headY + .022, .094, .022, .009, .009, white, 'head');
            oval(side * .043, headY + .022, .107, .008, .008, .004, eye, 'head');
            oval(side * .043, headY + .022, .112, .003, .005, .002, dark, 'head');
            tube([v(side * .068, headY + .037, .097), v(side * .046, headY + .043, .108), v(side * .027, headY + .038, .101)], .004, hair, 'head');
            oval(side * .106, headY, 0, .016, .028, .024, skin, 'head');
            if (['elf', 'noctari', 'catkin', 'wolfkin', 'beastfolk'].includes(race.id)) {
                const ear = mesh(new T.ConeGeometry(.019, .09, 16), skin, side * .115, headY + .049, -.004, 'head');
                ear.rotation.z = -side * .55;
            }
            tube([v(side * .043, neckY - .012, .057), v(side * .12, hipY + .575, .09), v(side * shoulder * .9, hipY + .55, .054)], .006, skin, 'torso');
            if (has(prefix + 'Arm')) {
                oval(shoulderP.x, shoulderP.y, 0, .072 * muscle, .072, .078, skin, prefix + 'Arm');
                segment(shoulderP, elbow, .057 * muscle, prefix + 'Arm');
                oval(elbow.x, elbow.y, elbow.z, .045, .046, .043, skin, prefix + 'Arm');
                segment(elbow, wrist, .046 * muscle, prefix + 'Arm');
            }
            if (has(prefix + 'Hand')) {
                oval(wrist.x + side * .006, wrist.y - .049, .017, .032, .057, .018, skin, prefix + 'Hand');
                for (let n = 0; n < 4; n++) {
                    const start = v(wrist.x + (n - 1.5) * .015, wrist.y - .083, .017), bend = start.clone().add(v(0, -.033, .005)), end = bend.clone().add(v(0, -(.02 + (.012 - Math.abs(n - 1.5) * .007)), .005));
                    segment(start, bend, .0075, prefix + 'Hand');
                    segment(bend, end, .0065, prefix + 'Hand');
                }
                segment(v(wrist.x - side * .027, wrist.y - .029, .015), v(wrist.x - side * .046, wrist.y - .073, .038), .01, prefix + 'Hand');
            }
            const hip = v(side * hips * .72, hipY - .017), knee = v(side * hips * .84, hipY - leg * .51, .016), ankle = v(side * hips * .91, .095, -.016);
            if (has(prefix + 'Leg')) {
                segment(hip, knee, .077 * muscle, prefix + 'Leg');
                oval(knee.x, knee.y, knee.z + .013, .047, .048, .045, skin, prefix + 'Leg');
                segment(knee, ankle, .054 * muscle, prefix + 'Leg');
            }
            if (has(prefix + 'Foot')) {
                oval(ankle.x, .058, .044, .049, .04, .096, skin, prefix + 'Foot');
                for (let n = 0; n < 5; n++)
                    oval(ankle.x + (n - 2) * .017, .041, .129 - Math.abs(n - 1) * .008, .01, .014, .026, skin, prefix + 'Foot');
            }
            if (has(prefix + 'Horn'))
                tube([v(side * .078, headY + .108, -.015), v(side * .104, headY + .206, -.042), v(side * .09, headY + .268, -.075)], .026, ivory, prefix + 'Horn');
            if (has(prefix + 'Wing')) {
                const membrane = new T.MeshPhysicalMaterial({ color: a.skin, roughness: .68, side: T.DoubleSide, transparent: true, opacity: .9 });
                wing(root, side, v(side * .13, hipY + .5, -.08), race.wings === 'feathers', (a.wingSpan ?? 1), race.wings === 'feathers' ? ivory : membrane, ivory);
            }
            if (has(prefix === 'left' ? 'extraLeftArm' : 'extraRightArm')) {
                const region = prefix === 'left' ? 'extraLeftArm' : 'extraRightArm';
                segment(v(side * .2, hipY + .33, -.03), v(side * .44, hipY + .05, .03), .055, region);
                segment(v(side * .44, hipY + .05, .03), v(side * .47, hipY - .18, .03), .04, region);
            }
        }
        const shorts = mesh(new T.LatheGeometry([[hips * .8, hipY - .08], [hips * 1.13, hipY], [hips * 1.13, hipY + .045]].map(([r, y]) => new T.Vector2(r, y)), 36), cloth, 0, 0, 0, 'torso');
        shorts.scale.z = .65;
        if (a.hairStyle !== 'none') {
            const cap = mesh(new T.SphereGeometry(.115 * a.head, 32, 20, 0, Math.PI * 2, 0, Math.PI * .36), hair, 0, headY + .015, -.007, 'head');
            cap.scale.set(1, 1.27, .98);
            for (let n = 0; n < 9; n++)
                tube([v((n - 4) * .021, headY + .102, .06), v((n - 4) * .023, headY + .14, -.005), v((n - 4) * .021, headY + .056, -.1)], .008, hair, 'head');
            if (a.hairStyle === 'long')
                oval(0, headY - .078, -.09, .105, .169, .042, hair, 'head');
        }
        if (has('tail'))
            tube([v(0, hipY, -.085), v(.14, hipY - .08, -.25), v(.32, hipY - .28, -.43), v(.38, hipY - .1, -.64)], .024 * (a.tailLength ?? 1), skin, 'tail');
    }
    else if (form === 'quadruped') {
        oval(0, .72, -.02, .25, .27, .49, skin, 'torso');
        oval(0, .77, .36, .22, .29, .22, skin, 'torso');
        segment(v(0, .87, .34), v(0, 1.05, .61), .16, 'head');
        oval(0, 1.09, .65, .14, .17, .2, skin, 'head');
        oval(0, 1.035, .845, .105, .065, .135, skin, 'head');
        oval(0, 1.052, .949, .066, .04, .028, dark, 'head');
        tube([v(-.095, 1.014, .8), v(0, 1.007, .96), v(.095, 1.014, .8)], .004, dark, 'head');
        for (const side of [-1, 1]) {
            const prefix = side > 0 ? 'left' : 'right';
            oval(side * .116, 1.12, .731, .026, .018, .01, white, 'head');
            oval(side * .121, 1.12, .74, .012, .014, .008, eye, 'head');
            const ear = mesh(new T.ConeGeometry(.072, .16, 16), skin, side * .12, 1.275, .6, 'head');
            ear.scale.z = .35;
            ear.rotation.z = -side * .3;
            for (const front of [true, false]) {
                const region = prefix + (front ? 'Arm' : 'Leg'), paw = prefix + (front ? 'Hand' : 'Foot'), z = front ? .3 : -.37, p = v(side * .2, .78, z), joint = v(side * .21, .36, z + (front ? -.01 : -.14)), hock = v(side * .21, .14, z + (front ? .035 : .01));
                if (has(region)) {
                    segment(p, joint, front ? .079 : .098, region);
                    segment(joint, hock, .044, region);
                }
                if (has(paw)) {
                    oval(side * .21, .065, z + .07, .067, .044, .105, skin, paw);
                    for (let n = 0; n < 4; n++)
                        oval(side * .21 + (n - 1.5) * .026, .047, z + .148, .014, .022, .04, skin, paw);
                }
            }
        }
        if (has('tail'))
            tube([v(0, .82, -.46), v(.06, .75, -.68), v(.2, .57, -.91), v(.34, .65, -1.06)], .041, skin, 'tail');
    }
    else {
        oval(0, .83, 0, .2, .3, .19, skin, 'torso');
        oval(0, 1.17, .035, .11, .19, .095, skin, 'head');
        oval(0, 1.35, .09, .122, .13, .124, skin, 'head');
        const beak = mesh(new T.ConeGeometry(.051, .22, 20), ivory, 0, 1.323, .283, 'head');
        beak.rotation.x = Math.PI / 2;
        beak.scale.z = .6;
        for (const side of [-1, 1]) {
            const prefix = side > 0 ? 'left' : 'right';
            oval(side * .103, 1.38, .14, .016, .017, .008, eye, 'head');
            wing(root, side, v(side * .16, 1.02, 0), true, .72 * (a.wingSpan ?? 1), ivory, skin);
            segment(v(side * .085, .61), v(side * .12, .34, -.06), .04, prefix + 'Leg');
            segment(v(side * .12, .34, -.06), v(side * .13, .11, .045), .023, prefix + 'Leg', ivory);
            for (let n = 0; n < 3; n++)
                tube([v(side * .13, .09, .04), v(side * .13 + (n - 1) * .035, .043, .1), v(side * .13 + (n - 1) * .055, .028, .18)], .009, ivory, prefix + 'Foot');
        }
        for (let n = 0; n < 7; n++) {
            const feather = oval((n - 3) * .025, .54, -.18, .022, .16, .02, ivory, 'torso');
            feather.rotation.x = .6;
        }
    }
    smoothBodyMesh(root, skin);
    for (const item of actor.rpg.inventory.filter(i => i.equipped)) {
        const gear = buildArtifact(item);
        gear.scale.multiplyScalar(item.slot === 'body' ? .45 : .38);
        gear.position.set(item.slot === 'body' ? 0 : item.slot === 'left' ? .38 : -.38, item.slot === 'body' ? 1.22 : .73, .09);
        root.add(gear);
    }
    const box = new T.Box3().setFromObject(root), height = box.max.y - box.min.y;
    root.scale.set(a.build, a.height / height, a.build);
    root.position.y = -box.min.y * root.scale.y;
    return root;
}

import { copyChargeCost } from './abilityCharge.mjs';
import { stateById } from './functionalStates.mjs';
import { spatialLabel, spatialTargets } from './abilitySpatial.mjs';
import { abilityLimit, abilityLimits, artifactCompatibility, magicEfficiency, skillValue, effectiveAttribute } from './creationRules.mjs';
import { resolveAnatomyImpact, automaticLife, isHitLocation, copyHitLocation, structureBlocked } from './anatomyModel.mjs';
import { activeEffects, evaluatedParameters, workingItem } from './rpgParameters.mjs';
export { activeEffects, evaluatedParameters, workingItem, inventoryMass } from './rpgParameters.mjs';
import { normalizeCharacterDraft, isCharacterDraft, resourceFields } from './characterModel.mjs';
import { bodyConsequences, bodyRegionDefs, partCondition } from './characterBody.mjs';
import { parameterFields, isCampaign, isActionInput, copyAbility, copyItem } from './rpgSchema.mjs';
import { statisticFields } from './characterStatistics.mjs';
const round = (x) => Math.abs(x) > 1e9 ? x : Math.round(x * 1e6) / 1e6;
const safe = (x) => Number.isFinite(x) && Math.abs(x) <= 1e12;
const fail = (s) => { throw new Error(s); };
const cloneWorld = (w) => ({ characters: w.characters.map(c => ({ ...normalizeCharacterDraft(c), id: c.id })), campaign: structuredClone(w.campaign) });
export const worldFingerprint = (w) => JSON.stringify(w);
export function effectiveActor(actor, seconds) {
    const next = { ...normalizeCharacterDraft(actor), id: actor.id };
    const p = evaluatedParameters(actor, seconds);
    for (const r of resourceFields) {
        const max = p[('maximum' + r.key[0].toUpperCase() + r.key.slice(1))];
        next.resources[r.key] = { maximum: max, current: String(Math.min(Number(actor.resources[r.key].current), Number(max))) };
    }
    for (const s of statisticFields)
        next.statistics[s.key] = p[s.key];
    return next;
}
function clampResources(actor, seconds) { const effective = effectiveActor(actor, seconds); for (const r of resourceFields)
    actor.resources[r.key].current = effective.resources[r.key].current; }
export function physiologyStatus(actor, seconds) {
    const p = actor.rpg.physiology, effects = activeEffects(actor.rpg, seconds);
    if (p.mode === 'none')
        return { effectiveMl: 0, deficit: 0, label: 'Кровь не требуется' };
    if (!p.normalMl)
        return { effectiveMl: 0, deficit: 0, label: 'Физиология не настроена' };
    let resource = null;
    try {
        resource = p.mode === 'mana' || p.mode === 'shadow' ? effectiveActor(actor, seconds).resources[p.mode] : null;
    }
    catch {
        return { effectiveMl: 0, deficit: 0, label: 'Проверь формулы' };
    }
    const own = resource ? (Number(resource.maximum) > 0 ? p.normalMl * Number(resource.current) / Number(resource.maximum) : 0) : p.currentMl;
    const effectiveMl = Math.min(p.normalMl, own + effects.reduce((s, e) => s + e.substituteMl, 0));
    const deficit = Math.max(0, 1 - effectiveMl / p.normalMl);
    const label = deficit >= p.criticalFraction ? 'Критическое состояние' : deficit >= p.impairedFraction ? 'Нарушение функций' : deficit >= p.weakFraction ? 'Слабость' : 'Стабильно';
    return { effectiveMl: round(effectiveMl), deficit, label };
}
export function equipItem(actor, itemId, equip) {
    const next = { ...normalizeCharacterDraft(actor), id: actor.id }, item = next.rpg.inventory.find(i => i.id === itemId);
    if (!item)
        fail('Предмет не найден.');
    if (!equip) {
        item.equipped = false;
        return next;
    }
    const i = item;
    const compatibility = artifactCompatibility(actor, i);
    if (!compatibility.ok)
        fail(compatibility.risk);
    if (i.quantity !== 1 || i.slot === 'none')
        fail('Экипируется отдельный экземпляр с заданным местом. Раздели стопку.');
    const c = bodyConsequences(next.body);
    if ((i.slot === 'left' && !c.leftHand) || (i.slot === 'right' && !c.rightHand) || (i.slot === 'both' && !c.twoHands))
        fail('Нужная рука недоступна.');
    if (i.covers.some(k => !next.body.parts[k]?.present))
        fail('Предмет покрывает отсутствующую область тела.');
    for (const other of next.rpg.inventory.filter(x => x.equipped && x.id !== i.id)) {
        const hands = ['left', 'right', 'both'].includes(i.slot) && ['left', 'right', 'both'].includes(other.slot) && (i.slot === other.slot || i.slot === 'both' || other.slot === 'both');
        const sameLayer = i.slot === 'body' && other.slot === 'body' && i.layer === other.layer && i.covers.some(k => other.covers.includes(k));
        const incompatible = i.conflictTags.some(t => other.tags.includes(t)) || other.conflictTags.some(t => i.tags.includes(t));
        const allowed = i.compatibleTags.some(t => other.tags.includes(t)) || other.compatibleTags.some(t => i.tags.includes(t));
        if (hands || incompatible || sameLayer && !allowed)
            fail('Конфликт с «' + other.name + '»: место, слой или совместимость.');
    }
    i.equipped = true;
    return next;
}
export function instantiateItem(t, id) { return { ...copyItem(t), id, templateId: t.id, quantity: 1, durability: t.maximumDurability, equipped: false }; }
function healLocal(target, input, effect) {
    const area = target.body.parts[input.region];
    if (!area?.present || !area.maximum)
        fail('Настрой локальное здоровье области цели.');
    let details = '';
    if (input.structureId) {
        const structure = target.body.anatomy?.structures.find(s => s.id === input.structureId && s.region === input.region);
        if (!structure)
            fail('Структура для лечения не принадлежит выбранной области.');
        structure.current = Math.min(structure.maximum, structure.current + Math.floor(effect.healAmount));
        structure.injuries = structure.injuries.filter(i => !effect.cureLabels.includes(i.label));
        details += '\nЛечение структуры: ' + structure.name + '; целостность ' + structure.current + '/' + structure.maximum + '.';
    }
    else
        area.current = Math.min(area.maximum, area.current + Math.floor(effect.healAmount));
    if (effect.stopBleeding) {
        area.bleedingMlPerSecond = 0;
        area.bleeding = 0;
        if (target.body.anatomy)
            for (const s of target.body.anatomy.structures)
                if (s.region === input.region)
                    s.activeBleeding = 0;
    }
    area.injuries = (area.injuries ?? []).filter(i => !effect.cureLabels.includes(i.label));
    if (area.current === area.maximum && !area.injuries.length && !area.bleeding && !area.bleedingMlPerSecond)
        area.wound = '';
    return details + '\nЛокальное лечение ' + effect.healAmount + '; снимаемые травмы: ' + effect.cureLabels.join(', ') + '. Объём крови не восстанавливается.';
}
export function consumeItemPlan(world, actorId, itemId, targetId, input, eventId) {
    try {
        if (!isCampaign(world.campaign) || world.characters.some(c => !isCharacterDraft(c)) || !isActionInput(input))
            fail('Проверь мир и параметры расходника.');
        if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(eventId) || world.campaign.logs.some(l => l.id === eventId) || world.characters.some(c => c.rpg.logs.some(l => l.id === eventId)))
            fail('Это действие уже учтено либо его идентификатор некорректен.');
        const w = cloneWorld(world), owner = w.characters.find(c => c.id === actorId), target = w.characters.find(c => c.id === targetId), item = owner?.rpg.inventory.find(i => i.id === itemId);
        if (!owner || !target || !item)
            fail('Применяющий, предмет или цель исчезли. Требуется решение мастера.');
        applyAutomaticLife(owner, w.campaign.seconds, eventId + '-owner-life');
        if (owner.rpg.dead || owner.body.consciousness !== 'awake')
            fail('Нужно сознание живого персонажа.');
        if (target.rpg.dead)
            fail('Расходник не воскрешает погибшего. Требуется отдельное решение мастера.');
        if (item.category !== 'consumable' || !item.consumable)
            fail('Задай явный эффект расходника в шаблоне или экземпляре.');
        if (item.equipped || item.maximumDurability > 0 && item.durability <= 0 && !item.worksBroken)
            fail('Перед использованием сними расходник; предмет должен быть работоспособен.');
        const compatibility = artifactCompatibility(owner, item);
        if (!compatibility.ok)
            fail(compatibility.risk);
        const effect = item.consumable;
        if (targetId !== actorId && effect.targets !== 'creature')
            fail('Этот расходник разрешён только на себя.');
        if (!input.accessible || input.distanceM > effect.rangeM)
            fail('Цель недоступна или вне дальности расходника.');
        if (effect.condition.trim() && !input.conditionsConfirmed)
            fail('Подтверди особое условие расходника.');
        if (effect.requiresFreeHand) {
            const body = bodyConsequences(owner.body), slots = owner.rpg.inventory.filter(i => i.equipped).map(i => i.slot);
            if (!(body.leftHand && !slots.some(s => s === 'left' || s === 'both') || body.rightHand && !slots.some(s => s === 'right' || s === 'both')))
                fail('Для расходника нужна доступная свободная рука.');
        }
        const local = effect.healAmount > 0 || effect.stopBleeding || effect.cureLabels.length > 0;
        if (!local && !Object.values(effect.restore).some(n => n > 0) && !effect.modifiers.length)
            fail('У расходника не задан численный эффект.');
        if (effect.modifiers.length && effect.duration <= 0)
            fail('Для временного эффекта расходника задай положительную длительность.');
        let details = 'Одна доза из стопки ' + item.quantity + '. Цель: ' + target.name + '.' + (effect.condition ? ' Условие: ' + effect.condition + '.' : '') + (input.note ? ' Основание мастера: ' + input.note : '');
        if (local)
            details += healLocal(target, input, effect);
        if (effect.modifiers.length) {
            if (effect.stacking === 'refresh' && effect.stackKey)
                for (const old of target.rpg.effects.filter(e => e.stackKey === effect.stackKey)) {
                    const cast = w.characters.find(c => c.id === old.ownerId)?.rpg.casts.find(c => c.id === old.castId);
                    if (cast?.status === 'maintaining')
                        cast.status = 'ended';
                }
            addEffect(target, { id: eventId + '-effect', name: item.name, strength: effect.strength, stackKey: effect.stackKey, stacking: effect.stacking, modifiers: effect.modifiers.map(m => ({ ...m })), expiresAt: w.campaign.seconds + effect.duration, bloodMlPerSecond: 0, substituteMl: 0, ownerId: '', castId: '' });
            details += '\nВременный эффект: ' + effect.duration + ' с; ' + modifiersText(effect.modifiers);
        }
        const effective = effectiveActor(target, w.campaign.seconds);
        for (const key of ['mana', 'shadow', 'stamina']) {
            const before = Number(effective.resources[key].current), after = round(Math.min(Number(effective.resources[key].maximum), before + effect.restore[key]));
            target.resources[key].current = String(after);
            if (effect.restore[key])
                details += '\n' + { mana: 'Мана', shadow: 'Тень', stamina: 'Выносливость' }[key] + ': ' + before + ' → ' + after + ' (доза ' + effect.restore[key] + ').';
        }
        if (item.quantity === 1)
            owner.rpg.inventory = owner.rpg.inventory.filter(i => i.id !== itemId);
        else
            item.quantity--;
        clampResources(target, w.campaign.seconds);
        applyAutomaticLife(target, w.campaign.seconds, eventId + '-target-life');
        const text = owner.name + ': использован расходник «' + item.name + '»';
        logWorld(w, eventId, text, details, [actorId, targetId]);
        w.campaign.revision++;
        if (!w.characters.every(isCharacterDraft) || !isCampaign(w.campaign))
            fail('Результат вышел за допустимые пределы. Ничего не изменено.');
        return { ok: true, plan: { fingerprint: worldFingerprint(world), world: w, text, details, eventId } };
    }
    catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : 'Не удалось использовать расходник.' };
    }
}
export function activateArtifact(actor, itemId, seconds, eventId) {
    const next = { ...normalizeCharacterDraft(actor), id: actor.id }, item = next.rpg.inventory.find(i => i.id === itemId);
    if (!item?.artifactLevel)
        fail('Это не артефакт.');
    if (next.rpg.dead || next.body.consciousness !== 'awake')
        fail('Нужно сознание живого персонажа.');
    const compatibility = artifactCompatibility(next, item);
    if (!compatibility.ok)
        fail(compatibility.risk);
    if (!workingItem(item))
        fail('Артефакт должен быть экипирован и работоспособен.');
    const cost = item.activationCost ?? 1, charge = item.artifactCharge ?? item.energyReserve ?? 0;
    if (charge < cost)
        fail('Собственной энергии артефакта недостаточно.');
    if (!item.activationModifiers?.length)
        fail('Задай численные эффекты активации артефакта.');
    item.artifactCharge = round(charge - cost);
    addEffect(next, { id: eventId ? eventId + '-effect' : crypto.randomUUID(), name: 'Артефакт: ' + item.name, strength: item.artifactLevel, stackKey: 'artifact-' + item.id, stacking: 'refresh', modifiers: structuredClone(item.activationModifiers), expiresAt: seconds + (item.activationDuration ?? 60), bloodMlPerSecond: 0, substituteMl: 0, ownerId: '', castId: '' });
    next.rpg.logs = [...next.rpg.logs, { id: eventId ?? crypto.randomUUID(), seconds, text: 'Активирован: ' + item.name, details: 'Потрачено ' + cost + ' собственной энергии. Осталось ' + item.artifactCharge + '.' }].slice(-200);
    return next;
}
export function rechargeArtifact(actor, itemId, amount, seconds) {
    if (!safe(amount) || amount <= 0)
        fail('Укажи положительное количество энергии.');
    const next = { ...normalizeCharacterDraft(actor), id: actor.id }, item = next.rpg.inventory.find(i => i.id === itemId);
    if (!item?.artifactLevel)
        fail('Артефакт не найден.');
    const energy = item.energyType ?? 'mana';
    if (energy !== (next.profile.energy ?? 'mana'))
        fail('Для зарядки нужна энергия того же типа.');
    const current = item.artifactCharge ?? item.energyReserve ?? 0, needed = Math.min(amount, (item.energyReserve ?? 0) - current);
    if (needed <= 0)
        fail('Запас уже полон.');
    if (Number(next.resources[energy].current) < needed)
        fail('Недостаточно энергии персонажа.');
    item.artifactCharge = round(current + needed);
    next.resources[energy].current = String(round(Number(next.resources[energy].current) - needed));
    next.rpg.logs = [...next.rpg.logs, { id: crypto.randomUUID(), seconds, text: 'Заряжен: ' + item.name, details: 'Передано ' + needed + ' энергии персонажа.' }].slice(-200);
    return next;
}
export function artifactContact(actor, itemId, seconds) {
    const next = { ...normalizeCharacterDraft(actor), id: actor.id }, item = next.rpg.inventory.find(i => i.id === itemId);
    if (!item)
        fail('Предмет не найден.');
    const compatibility = artifactCompatibility(next, item);
    if (compatibility.ok)
        fail('Опасной несовместимости нет.');
    const catastrophic = compatibility.risk.includes('аннигиляции'), region = item.slot === 'left' ? 'leftHand' : 'rightHand', part = next.body.parts[region];
    if (catastrophic) {
        next.rpg.dead = true;
        next.body.consciousness = 'unconscious';
    }
    else if (part?.present) {
        part.current = Math.max(0, part.current - 10);
        part.wound = [part.wound, 'Энергетический ожог от ' + item.name].filter(Boolean).join('\n').slice(-2000);
        const skin = next.body.anatomy?.structures.find(s => s.region === region && s.kind === 'skin');
        if (skin) {
            skin.current = Math.max(0, skin.current - 10);
            skin.injuries.push({ id: crypto.randomUUID(), label: 'Энергетический ожог', blocksUse: false, diagnosed: true });
            skin.injuries = skin.injuries.slice(-20);
        }
    }
    if (next.body.anatomy)
        next.body.anatomy.harmRevision++;
    next.rpg.logs = [...next.rpg.logs, { id: crypto.randomUUID(), seconds, text: 'Опасный контакт: ' + item.name, details: catastrophic ? 'Аннигиляция при критической несовместимости.' : 'Ожог при перегрузке: локальное повреждение 10.' }].slice(-200);
    return next;
}
export function addEffect(target, e) {
    if (e.stacking === 'refresh' && e.stackKey) {
        target.rpg.effects = target.rpg.effects.filter(x => x.stackKey !== e.stackKey);
    }
    if (target.rpg.effects.length >= 200)
        fail('Достигнут предел эффектов.');
    target.rpg.effects.push(e);
}
function requirements(actor, a, input, seconds, checkTarget = true) {
    applyAutomaticLife(actor, seconds, 'auto-state-' + seconds + '-' + (actor.body.anatomy?.harmRevision ?? 0));
    if (actor.rpg.dead)
        fail('Применяющий отмечен погибшим.');
    const limit = abilityLimit(actor, a);
    if (limit)
        fail(limit);
    if (!a.approved)
        fail('Способность не утверждена.');
    const blocked = activeEffects(actor.rpg, seconds).flatMap(e => e.statusEffects ?? []).map(id => stateById(id)?.blocks);
    if (a.schoolId && !a.innate && blocked.includes('magic'))
        fail('Магические каналы заблокированы.');
    if (a.speech && blocked.includes('speech'))
        fail('Безмолвие мешает речи.');
    if ((a.movement || a.flight) && blocked.includes('movement'))
        fail('Движение заблокировано эффектом.');
    if (a.schoolId && ['word', 'soul', 'illusion', 'dreams', 'divination'].includes(a.schoolId) && blocked.includes('mental'))
        fail('Ментальное действие сейчас недоступно.');
    const c = bodyConsequences(actor.body);
    if (a.requiresAwake && actor.body.consciousness !== 'awake')
        fail('Нужно сознание.');
    const occupied = (hand) => actor.rpg.inventory.some(i => i.equipped && (i.slot === hand || i.slot === 'both'));
    const left = c.leftHand && (!a.freeHands || !occupied('left')), right = c.rightHand && (!a.freeHands || !occupied('right'));
    if (a.hands === 'left' && !left || a.hands === 'right' && !right || a.hands === 'both' && !(left && right) || a.hands === 'any' && !(left || right))
        fail('Не выполнено требование к рукам.');
    if (a.flight && !c.canFly)
        fail(c.flightReasons.join(' '));
    if (a.movement && !a.flight && (c.movementFactor <= 0 || evaluatedParameters(actor, seconds).movement !== '' && Number(evaluatedParameters(actor, seconds).movement) <= 0))
        fail('Нужна возможность двигаться.');
    if (a.requiredParts.some(k => !usablePart(actor, k)))
        fail('Не действует необходимая область тела.');
    if ((a.requiredStructures ?? []).some(id => { const s = actor.body.anatomy?.structures.find(s => s.id === id); return !s || !actor.body.parts[s.region]?.present || structureBlocked(s); }))
        fail('Не действует необходимая внутренняя структура.');
    if (a.speech && actor.body.anatomy?.structures.some(s => s.functionGroup === 'speech' && structureBlocked(s)))
        fail('Повреждение не позволяет произнести слова.');
    if (a.speech && !input.canSpeak)
        fail('Нужно подтверждение возможности говорить.');
    if (a.condition && !input.conditionsConfirmed)
        fail('Подтверди особое условие способности.');
    const tags = actor.rpg.inventory.filter(workingItem).flatMap(i => i.tags);
    if (a.requiredTags.some(t => !tags.includes(t)))
        fail('Не хватает рабочего экипированного предмета с нужной меткой.');
    if (checkTarget && !input.accessible)
        fail('Цель или область недоступна.');
    if (checkTarget && (!safe(input.distanceM) || input.distanceM < 0 || input.distanceM > a.rangeM))
        fail('Цель вне заданной дальности.');
    clampResources(actor, seconds);
}
function spend(actor, cost) {
    for (const k of ['mana', 'shadow', 'stamina'])
        if (Number(actor.resources[k].current) + 1e-8 < cost[k])
            fail('Недостаточно ресурса: ' + k);
    for (const k of ['mana', 'shadow', 'stamina'])
        actor.resources[k].current = String(round(Math.max(0, Number(actor.resources[k].current) - cost[k])));
}
function logWorld(w, id, text, details, ids) {
    const log = { id, seconds: w.campaign.seconds, text, details: details.slice(0, 12000) };
    w.campaign.logs = [...w.campaign.logs, log].slice(-200);
    for (const a of w.characters.filter(c => ids.includes(c.id)))
        a.rpg.logs = [...a.rpg.logs, log].slice(-200);
}
function impacts(w, owner, target, cast, random) {
    const original = cast.ability, skill = (original.skillId ?? (original.schoolId ? 'spellcraft' : original.mechanism === 'heal' ? 'medicine' : original.mechanism === 'stone' ? 'ranged' : 'melee'));
    const masteryFactor = (0.5 + skillValue(owner, skill, w.campaign.seconds) / 40) * (0.5 + (original.mastery ?? 20) / 40);
    const basePower = effectiveAttribute(owner, 'energyThroughput') * 1.2 + effectiveAttribute(owner, 'magicControl') * .8;
    const powerRatio = basePower > 0 ? Number(evaluatedParameters(owner, w.campaign.seconds).spellPower) / basePower : 0;
    const rawFactor = masteryFactor * (original.schoolId && !original.innate ? magicEfficiency(owner, original.schoolId, original.basisSchoolId) * powerRatio : 1) * (original.flight ? bodyConsequences(owner.body).flightFactor : 1);
    const powerCap = original.schoolId && !original.innate ? abilityLimits(owner.profile).power : Infinity;
    const factor = original.strength > 0 ? Math.min(rawFactor, powerCap / original.strength) : rawFactor;
    const a = { ...original, strength: original.strength * factor, healAmount: Math.floor(original.healAmount * factor), modifiers: original.modifiers.map(m => ({ ...m, flat: m.flat * factor, percent: m.percent * factor })) }, i = cast.input, t = w.campaign.seconds;
    if (owner.id !== target.id)
        applyAutomaticLife(target, t, (cast.id + '-life-check').slice(0, 160));
    let details = 'Эффективность: ' + Math.round(factor * 100) + '%; Механизм: ' + a.mechanism + '; дистанция ' + i.distanceM + ' м. ' + (i.note ? 'Решение мастера: ' + i.note : '');
    let text = owner.name + ' → ' + target.name + ': ' + a.name;
    if (original.schoolId && !original.innate)
        details += '\nРасчётная сила: ' + round(original.strength * rawFactor) + '; предел развития: ' + powerCap + '; применена сила: ' + round(a.strength) + '.';
    if (original.flight)
        details += '\nДоступная мощность крыльев: ' + Math.round(bodyConsequences(owner.body).flightFactor * 100) + '%.';
    if (target.rpg.dead && a.mechanism !== 'manual')
        fail('Цель отмечена погибшей; воскрешение требует отдельного правила.');
    const area = target.body.parts[i.region];
    const needsArea = ['stone', 'impact', 'manual', 'heal'].includes(a.mechanism);
    if (needsArea && (!area?.present || !area.maximum))
        fail('Настрой область цели и её локальное здоровье.');
    if (['stone', 'impact', 'manual'].includes(a.mechanism)) {
        const dodge = random(target.id) * 100, critical = random(target.id) * 100;
        const dodged = dodge < i.dodgeChance, crit = !dodged && critical < i.criticalChance;
        details += '\nБроски: уворот ' + dodge.toFixed(3) + ' / ' + i.dodgeChance + '%; крит ' + critical.toFixed(3) + ' / ' + i.criticalChance + '%.';
        if (dodged) {
            text += ' — уворот';
            details += ' Воздействия на цель нет.';
        }
        else {
            const previousHarm = target.body.anatomy?.harmRevision;
            let damage = Math.floor(i.manualLocal * factor), internalEnergy = null;
            if (a.mechanism === 'stone' || a.mechanism === 'impact') {
                const profile = target.rpg.impact[i.region];
                if (!profile)
                    fail('Для области цели не задана калибровка тупого удара.');
                if (!safe(i.criticalContactFactor) || i.criticalContactFactor <= 0)
                    fail('Коэффициент критического контакта должен быть положительным.');
                let energy = 0.5 * a.massKg * a.speedMs * a.speedMs * factor;
                if (!safe(energy))
                    fail('Энергия выходит за допустимый диапазон.');
                details += '\nМасса ' + a.massKg + ' кг; скорость ' + a.speedMs + ' м/с; энергия ' + energy + ' Дж; импульс ' + a.massKg * a.speedMs + ' кг·м/с; контакт ' + a.contactCm2 + ' см².';
                if (i.armorPath === 'gap' && !i.gapConfirmed)
                    fail('Попадание в зазор должен подтвердить мастер.');
                const armor = i.armorPath === 'gap' ? [] : target.rpg.inventory.filter(x => workingItem(x) && x.covers.includes(i.region)).sort((a, b) => b.layer - a.layer || a.id.localeCompare(b.id));
                for (const armorItem of armor) {
                    const before = energy, factor = armorItem.maximumDurability > 0 ? armorItem.durability / armorItem.maximumDurability : 1;
                    const removed = Math.min(energy * (1 - armorItem.transmission), armorItem.absorptionJ * factor);
                    energy = Math.max(0, energy - removed);
                    if (armorItem.maximumDurability > 0 && armorItem.joulesPerWear > 0)
                        armorItem.durability = round(Math.max(0, armorItem.durability - removed / armorItem.joulesPerWear));
                    details += '\nСлой ' + armorItem.layer + ' «' + armorItem.name + '»: ' + before.toFixed(3) + ' → ' + energy.toFixed(3) + ' Дж; прочность ' + armorItem.durability + '.';
                }
                internalEnergy = energy;
                const contact = profile.referenceCm2 / a.contactCm2 * (crit ? i.criticalContactFactor : 1);
                const threshold = profile.thresholdJ / contact;
                damage = Math.floor(Math.max(0, (energy - threshold) / profile.joulesPerHp));
                if (!safe(damage))
                    fail('Повреждение выходит за допустимый диапазон.');
                details += '\nТестовая модель: порог ' + threshold.toFixed(3) + ' Дж; ' + profile.joulesPerHp + ' Дж/HP; локальный урон ' + damage + '. Крит меняет контакт, не энергию и не обход брони.';
            }
            if (!Number.isSafeInteger(damage) || damage < 0)
                fail('Локальное повреждение должно быть целым неотрицательным.');
            if (target.body.anatomy && !i.skipAnatomy && internalEnergy !== null) {
                const result = resolveAnatomyImpact(target.body.anatomy, i.region, { ...copyHitLocation(i.hit ?? { x: .5, y: .5, approach: 'front', mechanism: 'blunt', angleX: 0, angleY: 0 }), mechanism: a.mechanism === 'stone' ? 'blunt' : a.damageType ?? 'blunt' }, internalEnergy, a.contactCm2 / (crit ? i.criticalContactFactor : 1), cast.id);
                target.body.anatomy = result.anatomy;
                area.bleedingMlPerSecond = Math.max(area.bleedingMlPerSecond ?? 0, result.bleedingRate);
                area.internalBleeding = area.internalBleeding || result.internal;
                details += '\nВнутренний путь: ' + (result.anatomy.lastTrace?.steps.map(s => s.name + ': ' + s.beforeJ.toFixed(2) + ' → ' + s.afterJ.toFixed(2) + ' Дж, ' + s.damage + ' HP').join('; ') || 'структуры не пересечены');
            }
            else if (target.body.anatomy && (damage || i.manualSystemic || i.bleedingMlPerSecond || i.injury))
                target.body.anatomy.harmRevision++;
            if (target.body.anatomy && target.body.anatomy.harmRevision === previousHarm && (damage || i.manualSystemic || i.bleedingMlPerSecond || i.injury))
                target.body.anatomy.harmRevision++;
            area.current = Math.max(0, area.current - damage);
            area.bleedingMlPerSecond = Math.max(area.bleedingMlPerSecond ?? 0, i.bleedingMlPerSecond);
            if (i.injury) {
                if ((area.injuries ?? []).length >= 100)
                    fail('Слишком много травм области.');
                area.injuries = [...(area.injuries ?? []), { id: cast.id + '-injury', label: i.injury, blocksUse: false, slowdown: 0 }];
            }
            if (damage)
                area.wound = [area.wound, a.name + (crit ? ' (критический контакт)' : '')].filter(Boolean).join('\n').slice(-2000);
            details += '\nИтог: ' + damage + ' локального HP; кровь ' + (area.bleedingMlPerSecond ?? 0) + ' мл/с.';
            text += crit ? ' — критический контакт' : ' — попадание';
        }
    }
    else if (a.mechanism === 'heal') {
        details += healLocal(target, i, a);
    }
    else {
        if (a.mechanism === 'blood' && (!target.rpg.physiology.normalMl || target.rpg.physiology.mode !== 'blood'))
            fail('Восстановление крови требует настроенной кровяной физиологии.');
        if (['blood', 'substitute'].includes(a.mechanism) && a.duration <= 0)
            fail('Задай положительную длительность восстановления или замещения.');
        const expires = a.duration > 0 ? t + a.duration : null;
        if (a.stacking === 'refresh' && a.stackKey) {
            for (const old of target.rpg.effects.filter(e => e.stackKey === a.stackKey)) {
                const prior = w.characters.find(c => c.id === old.ownerId)?.rpg.casts.find(c => c.id === old.castId);
                if (prior && prior.status === 'maintaining')
                    prior.status = 'ended';
            }
        }
        addEffect(target, { id: cast.id + '-effect', strength: a.strength, statusEffects: a.statusEffects ? [...a.statusEffects] : [], name: a.name, stackKey: a.stackKey, stacking: a.stacking, modifiers: a.modifiers.map(m => ({ ...m })), expiresAt: expires, bloodMlPerSecond: a.mechanism === 'blood' ? a.bloodMlPerSecond : 0, substituteMl: a.mechanism === 'substitute' ? a.substituteMl : 0, ownerId: owner.id, castId: cast.id });
        cast.status = Object.values(a.upkeep).some(n => n > 0) ? 'maintaining' : 'ended';
        cast.endsAt = expires;
        details += '\nДлительность: ' + (expires === null ? 'до ручного снятия' : a.duration + ' с') + '; поддержание ' + JSON.stringify(a.upkeep) + ' ед./с.';
    }
    if (cast.status === 'ready')
        cast.status = 'ended';
    clampResources(target, t);
    applyAutomaticLife(target, t, cast.id + '-life');
    if (target.rpg.dead)
        details += '\nАвтоматический итог: смерть. Мастер может отменить её с указанием причины.';
    else if (target.body.consciousness === 'unconscious')
        details += '\nИтог: без сознания.';
    return { text, details };
}
export function makeActionPlan(world, actorId, abilityId, targetId, input, eventId, random = Math.random, roundPreparation) {
    try {
        if (!isCampaign(world.campaign) || world.characters.some(c => !isCharacterDraft(c)))
            fail('Исправь незавершённые поля персонажей перед действием.');
        if (world.campaign.logs.some(l => l.id === eventId) || world.characters.some(c => c.rpg.casts.some(x => x.id === eventId)))
            fail('Это действие уже учтено.');
        if (!/^[a-zA-Z0-9:_-]+$/.test(eventId))
            fail('Некорректный идентификатор действия.');
        const w = cloneWorld(world), owner = w.characters.find(c => c.id === actorId), target = w.characters.find(c => c.id === targetId);
        if (!owner || !target && roundPreparation?.binding !== 'unbound')
            fail('Выбери применяющего и цель.');
        if (roundPreparation && (!/^[a-zA-Z0-9:_-]{1,160}$/.test(roundPreparation.workId) || !['bound', 'unbound'].includes(roundPreparation.binding)))
            fail('Проверь работу и привязку подготовки.');
        const a = owner.rpg.abilities.find(a => a.id === abilityId);
        if (!a)
            fail('Способность не найдена.');
        if (a.chargePolicy && !roundPreparation)
            fail('Настройки удержания применяются к отдельной раундовой подготовке и выпуску.');
        if (a.spatial && (!roundPreparation || roundPreparation.binding !== 'unbound'))
            fail('Пространственная способность готовится без привязки и выпускается отдельным действием раунда.');
        if (a.spatial && Object.values(a.upkeep).some(n => n > 0))
            fail('Поддерживаемая пространственная область ещё не подключена. Начальный расход не списан.');
        if (a.spatial && ['stone', 'impact'].includes(a.mechanism) && a.spatial.shape !== 'point')
            fail('Для физической области нужно отдельное правило распределения энергии.');
        if (![input.manualLocal, input.manualSystemic, input.bleedingMlPerSecond, input.distanceM, input.criticalChance, input.dodgeChance, input.criticalContactFactor].every(x => safe(x) && x >= 0) || input.criticalChance > 100 || input.dodgeChance > 100)
            fail('Проверь численные поля действия.');
        if (input.hit !== undefined && !isHitLocation(input.hit))
            fail('Проверь точку и направление попадания.');
        if (!Number.isInteger(input.manualLocal) || input.injury.length > 120 || input.note.length > 1000)
            fail('Проверь описание или локальный урон.');
        requirements(owner, a, input, w.campaign.seconds, roundPreparation?.binding !== 'unbound');
        if (!roundPreparation && ['stone', 'impact', 'manual', 'heal'].includes(a.mechanism) && (!target.body.parts[input.region]?.present || !target.body.parts[input.region]?.maximum))
            fail('Настрой локальное здоровье области цели.');
        if (!roundPreparation && ['stone', 'impact'].includes(a.mechanism) && !target.rpg.impact[input.region])
            fail('Для области цели не задана калибровка тупого удара.');
        const beforePayment = copyChargeCost({ mana: Number(owner.resources.mana.current), shadow: Number(owner.resources.shadow.current), stamina: Number(owner.resources.stamina.current) });
        spend(owner, a.cost);
        const paidCost = copyChargeCost({ mana: round(beforePayment.mana - Number(owner.resources.mana.current)), shadow: round(beforePayment.shadow - Number(owner.resources.shadow.current)), stamina: round(beforePayment.stamina - Number(owner.resources.stamina.current)) });
        if (owner.rpg.casts.length >= 200) {
            owner.rpg.casts = owner.rpg.casts.filter(c => ['preparing', 'ready', 'maintaining'].includes(c.status) || w.characters.some(t => t.rpg.effects.some(e => e.ownerId === owner.id && e.castId === c.id)));
            if (owner.rpg.casts.length >= 200)
                fail('Слишком много незавершённых применений.');
        }
        const cast = { id: eventId, ability: { ...copyAbility(a), id: a.id, templateId: a.templateId, approved: a.approved }, targetId: roundPreparation?.binding === 'unbound' ? '' : targetId, input: { ...input, ...(input.hit ? { hit: copyHitLocation(input.hit) } : {}) }, status: roundPreparation || a.preparation > 0 ? 'preparing' : 'ready', readyAt: roundPreparation ? w.campaign.seconds : w.campaign.seconds + a.preparation, endsAt: null, ...(roundPreparation ? { roundPreparation: { ...roundPreparation, paidCost } } : {}) };
        owner.rpg.casts.push(cast);
        const result = cast.status === 'preparing' ? { text: owner.name + ': подготовка «' + a.name + '»', details: 'Оплачено ' + JSON.stringify(a.cost) + '. ' + (roundPreparation ? 'Готовность определяется переносимой работой. Привязка: ' + roundPreparation.binding + '.' : 'Готово в ' + cast.readyAt + ' с. Цель: ' + target.name + '.') } : impacts(w, owner, target, cast, random);
        applyAutomaticLife(owner, w.campaign.seconds, eventId + '-cost-life');
        if (owner.rpg.dead)
            result.details += '\nПосле расхода ресурсов применяющий погиб. Мастер может отменить это с указанием причины.';
        else if (owner.body.consciousness === 'unconscious')
            result.details += '\nПосле расхода ресурсов применяющий без сознания.';
        logWorld(w, eventId, result.text, result.details, roundPreparation ? [actorId] : [actorId, targetId]);
        w.campaign.revision++;
        if (!w.characters.every(isCharacterDraft) || !isCampaign(w.campaign))
            fail('Результат вышел за допустимые пределы. Ничего не изменено.');
        return { ok: true, plan: { fingerprint: worldFingerprint(world), world: w, ...result, eventId } };
    }
    catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : 'Не удалось рассчитать действие.' };
    }
}
export function releasePlan(world, ownerId, castId, eventId, random = Math.random) {
    try {
        const w = cloneWorld(world), owner = w.characters.find(c => c.id === ownerId), cast = owner?.rpg.casts.find(c => c.id === castId);
        if (!owner || !cast || cast.status !== 'ready')
            fail('Применение ещё не готово или уже завершено.');
        if (cast.ability.spatial)
            fail('Пространственный заряд выпускается через расчёт раунда.');
        checkChargeHold(owner, cast, w.campaign.seconds);
        const target = w.characters.find(c => c.id === cast.targetId);
        if (!target)
            fail('Цель больше не существует.');
        requirements(owner, cast.ability, cast.input, w.campaign.seconds);
        const result = impacts(w, owner, target, cast, random);
        logWorld(w, eventId, result.text, result.details, [ownerId, target.id]);
        w.campaign.revision++;
        if (!w.characters.every(isCharacterDraft) || !isCampaign(w.campaign))
            fail('Некорректный результат.');
        return { ok: true, plan: { fingerprint: worldFingerprint(world), world: w, ...result, eventId } };
    }
    catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : 'Ошибка выпуска.' };
    }
}
// Round preparation is completed by exact personal work, never by readyAt.
export function readyRoundPreparation(world, ownerId, castId, eventId, input) {
    if (!isActionInput(input))
        fail('Проверь параметры подготовки.');
    const w = cloneWorld(world), owner = w.characters.find(c => c.id === ownerId), cast = owner?.rpg.casts.find(c => c.id === castId);
    if (!owner || !cast?.roundPreparation || cast.status !== 'preparing')
        throw Error('Подготовка не найдена или уже завершена.');
    if (cast.roundPreparation.binding === 'bound' && !w.characters.some(c => c.id === cast.targetId))
        fail('Привязанная цель исчезла. Требуется решение мастера.');
    requirements(owner, cast.ability, input, w.campaign.seconds, cast.roundPreparation.binding === 'bound');
    cast.input = structuredClone(input);
    cast.status = 'ready';
    cast.readyAt = w.campaign.seconds;
    logWorld(w, eventId, 'Готов заряд: ' + cast.ability.name, 'Работа завершена; выпуск требует отдельного действия. Ресурсы повторно не списываются.', [ownerId]);
    w.campaign.revision++;
    if (!w.characters.every(isCharacterDraft) || !isCampaign(w.campaign))
        fail('Некорректный результат подготовки.');
    return w;
}
export function releaseRoundPlan(world, ownerId, castId, targetId, input, eventId, random) {
    try {
        if (!isActionInput(input) || !Number.isInteger(input.manualLocal) || input.criticalContactFactor <= 0)
            fail('Проверь параметры выпуска.');
        if (world.campaign.logs.some(l => l.id === eventId))
            fail('Это действие уже учтено.');
        const w = cloneWorld(world), owner = w.characters.find(c => c.id === ownerId), cast = owner?.rpg.casts.find(c => c.id === castId), target = w.characters.find(c => c.id === targetId);
        if (!owner || !cast || cast.status !== 'ready' || !target)
            throw Error('Выбери готовый собственный заряд и существующую цель.');
        checkChargeHold(owner, cast, w.campaign.seconds);
        if (cast.ability.spatial)
            fail('Выбери пространственную цель по форме этого заряда.');
        if (cast.roundPreparation?.binding !== 'unbound' && cast.targetId !== targetId)
            fail('Заряд привязан к другой цели. Смена требует отдельного решения.');
        if (['stone', 'impact', 'manual', 'heal'].includes(cast.ability.mechanism) && (!target.body.parts[input.region]?.present || !target.body.parts[input.region]?.maximum))
            fail('Настрой локальное здоровье области цели.');
        if (['stone', 'impact'].includes(cast.ability.mechanism) && !target.rpg.impact[input.region])
            fail('Для области цели не задана калибровка удара.');
        cast.targetId = targetId;
        cast.input = structuredClone(input);
        requirements(owner, cast.ability, input, w.campaign.seconds);
        const result = impacts(w, owner, target, cast, random);
        logWorld(w, eventId, result.text, result.details, [ownerId, targetId]);
        w.campaign.revision++;
        if (!w.characters.every(isCharacterDraft) || !isCampaign(w.campaign))
            fail('Некорректный результат выпуска.');
        return { ok: true, plan: { fingerprint: worldFingerprint(world), world: w, ...result, eventId } };
    }
    catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : 'Ошибка выпуска.' };
    }
}
export function releaseSpatialRoundPlan(world, ownerId, castId, sceneId, target, input, eventId, random, targetInputs = []) {
    try {
        const validInput = (i) => isActionInput(i) && Number.isInteger(i.manualLocal) && i.criticalContactFactor > 0;
        if (!isCampaign(world.campaign) || !world.characters.every(isCharacterDraft) || !validInput(input))
            fail('Проверь мир и параметры пространственного выпуска.');
        if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(eventId) || world.campaign.logs.some(l => l.id === eventId))
            fail('Это действие уже учтено либо идентификатор некорректен.');
        const w = cloneWorld(world), owner = w.characters.find(c => c.id === ownerId), cast = owner?.rpg.casts.find(c => c.id === castId), scene = w.campaign.scenes?.scenes.find(s => s.id === sceneId);
        if (!owner || !cast?.ability.spatial || cast.status !== 'ready' || cast.roundPreparation?.binding !== 'unbound' || !scene || !('point' in target))
            fail('Выбери готовый собственный пространственный заряд и его сцену.');
        if (Object.values(cast.ability.upkeep).some(n => n > 0))
            fail('Поддерживаемая пространственная область ещё не подключена. Сохрани заряд для решения мастера.');
        checkChargeHold(owner, cast, w.campaign.seconds);
        const aim = 'point' in target ? target.point : fail('Выбери координаты пространственного выпуска.');
        if (!Array.isArray(targetInputs) || targetInputs.length > 200 || new Set(targetInputs.map(t => t.actorId)).size !== targetInputs.length ||
            !targetInputs.every(t => scene.tokens.some(p => p.actorId === t.actorId) && validInput(t.input)))
            fail('Проверь индивидуальные параметры существ этой сцены.');
        const selected = spatialTargets(scene, ownerId, cast.ability.spatial, target, cast.ability.rangeM), sourceInput = { ...structuredClone(input), distanceM: selected.distanceM };
        if (['stone', 'impact'].includes(cast.ability.mechanism) && (cast.ability.spatial.shape !== 'point' || selected.actorIds.length > 1))
            fail('Физический снаряд подключён только к однозначной точке. Для области нужно отдельное правило распределения энергии.');
        requirements(owner, cast.ability, sourceInput, w.campaign.seconds);
        // A self-hit cannot change the strength of the remaining hits in this release.
        const sourceOwner = structuredClone(owner), origin = scene.tokens.find(t => t.actorId === ownerId), details = [], targets = [], inputs = [];
        for (const id of selected.actorIds) {
            const recipient = w.characters.find(c => c.id === id), position = scene.tokens.find(t => t.actorId === id);
            if (!recipient)
                fail('В пространственной цели отсутствует персонаж. Требуется решение мастера.');
            const each = { ...structuredClone(targetInputs.find(t => t.actorId === id)?.input ?? input), distanceM: Math.hypot(origin.x - position.x, origin.y - position.y, origin.z - position.z) };
            if (!each.accessible || cast.ability.condition && !each.conditionsConfirmed)
                fail('Не подтверждены доступность или условие для «' + recipient.name + '».');
            if (['stone', 'impact', 'manual', 'heal'].includes(cast.ability.mechanism) && (!recipient.body.parts[each.region]?.present || !recipient.body.parts[each.region]?.maximum))
                fail('Настрой локальное здоровье области цели «' + recipient.name + '».');
            if (['stone', 'impact'].includes(cast.ability.mechanism) && !recipient.rpg.impact[each.region])
                fail('Для области цели «' + recipient.name + '» не задана калибровка удара.');
            const perTarget = { ...structuredClone(cast), targetId: id, input: each, status: 'ready' };
            const result = impacts(w, sourceOwner, recipient, perTarget, random);
            details.push(result.text + '\n' + result.details);
            targets.push({ actorId: id, name: recipient.name, details: result.details.slice(0, 12000) });
            inputs.push({ actorId: id, input: each });
        }
        cast.input = sourceInput;
        cast.targetId = '';
        cast.status = 'ended';
        cast.endsAt = cast.ability.duration > 0 ? w.campaign.seconds + cast.ability.duration : null;
        cast.spatialRelease = { sceneId, kind: target.kind, point: { ...aim }, actorIds: [...selected.actorIds], inputs };
        const text = owner.name + ': пространственный выпуск «' + cast.ability.name + '»', description = spatialLabel(cast.ability.spatial) + '; координаты (' + aim.x + '; ' + aim.y + '; ' + aim.z + ').\n' +
            (details.length ? details.join('\n\n') : 'В области нет отметок существ. Заряд выпущен; постоянная зона и повреждение окружения не создавались.');
        logWorld(w, eventId, text, description, [ownerId, ...selected.actorIds]);
        w.campaign.revision++;
        if (!w.characters.every(isCharacterDraft) || !isCampaign(w.campaign))
            fail('Результат вышел за допустимые пределы. Ничего не изменено.');
        return { ok: true, plan: { fingerprint: worldFingerprint(world), world: w, text, details: description.slice(0, 12000), eventId, targets } };
    }
    catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : 'Не удалось выпустить пространственный заряд.' };
    }
}
export function checkChargeHold(owner, cast, seconds, end = seconds) {
    const p = cast.ability.chargePolicy;
    if (!p || cast.status !== 'ready' || !cast.roundPreparation)
        return;
    if (p.maxHoldSeconds !== null && end > cast.readyAt + p.maxHoldSeconds + 1e-8)
        fail('Истёк срок удержания заряда «' + cast.ability.name + '». Выпусти раньше либо прерви по решению мастера.');
    if (p.requireConditions)
        requirements(owner, cast.ability, cast.input, seconds, false);
}
export function confirmChargeConditions(world, ownerId, castId, conditionsConfirmed, canSpeak) {
    const w = cloneWorld(world), owner = w.characters.find(c => c.id === ownerId), cast = owner?.rpg.casts.find(c => c.id === castId);
    if (!owner || !cast?.roundPreparation || !['preparing', 'ready'].includes(cast.status))
        fail('Незавершённый раундовый заряд не найден.');
    cast.input = { ...cast.input, conditionsConfirmed, canSpeak };
    if (cast.ability.chargePolicy?.requireConditions)
        requirements(owner, cast.ability, cast.input, w.campaign.seconds, false);
    checkChargeHold(owner, cast, w.campaign.seconds);
    return w;
}
export function interruptCast(world, ownerId, castId, eventId, reason = 'Ручное прерывание') {
    if (!reason.trim() || reason.length > 1000 || world.campaign.logs.some(l => l.id === eventId))
        fail('Укажи причину прерывания; повторное событие недопустимо.');
    const w = cloneWorld(world), owner = w.characters.find(c => c.id === ownerId), cast = owner?.rpg.casts.find(c => c.id === castId);
    if (!owner || !cast || !['preparing', 'ready', 'maintaining'].includes(cast.status))
        fail('Незавершённое применение не найдено.');
    const phase = cast.status, policy = cast.ability.chargePolicy, percent = phase === 'preparing' ? policy?.refundPreparingPercent ?? 0 : phase === 'ready' ? policy?.refundReadyPercent ?? 0 : 0;
    const paid = cast.roundPreparation?.paidCost, refunded = { mana: 0, shadow: 0, stamina: 0 };
    if (phase === 'maintaining')
        for (const actor of w.characters)
            actor.rpg.effects = actor.rpg.effects.filter(e => e.castId !== castId || e.ownerId !== ownerId);
    cast.status = 'interrupted';
    for (const actor of w.characters)
        clampResources(actor, w.campaign.seconds);
    for (const k of ['mana', 'shadow', 'stamina']) {
        const before = Number(owner.resources[k].current), max = Number(effectiveActor(owner, w.campaign.seconds).resources[k].maximum);
        refunded[k] = round(Math.max(0, Math.min(max - before, (paid?.[k] ?? 0) * percent / 100)));
        owner.resources[k].current = String(round(before + refunded[k]));
    }
    cast.interruption = { reason, phase, refunded };
    logWorld(w, eventId, 'Прервано: ' + cast.ability.name, reason + '\nВозврат начального расхода по правилу способности: ' + JSON.stringify(refunded) + '. Расход удержания не возвращается. Уже произошедшие разовые эффекты не отменены.', [ownerId, cast.targetId]);
    w.campaign.revision++;
    return w;
}
function ongoingCosts(actor, seconds) {
    const costs = { mana: 0, shadow: 0, stamina: 0 };
    for (const c of actor.rpg.casts.filter(c => c.status === 'maintaining'))
        for (const k of ['mana', 'shadow', 'stamina'])
            costs[k] += c.ability.upkeep[k];
    for (const c of actor.rpg.casts.filter(c => c.status === 'ready' && c.roundPreparation && c.ability.chargePolicy))
        for (const k of ['mana', 'shadow', 'stamina'])
            costs[k] += c.ability.chargePolicy.holdCost[k];
    const p = actor.rpg.physiology;
    if ((p.mode === 'mana' || p.mode === 'shadow') && p.normalMl > 0 && !actor.rpg.dead) {
        const rate = Object.values(actor.body.parts).reduce((s, x) => s + (x.bleedingMlPerSecond ?? 0), 0);
        costs[p.mode] += rate / p.normalMl * Number(effectiveActor(actor, seconds).resources[p.mode].maximum);
    }
    if (!actor.rpg.dead) {
        const energy = actor.profile.energy ?? 'mana';
        costs[energy] -= Number(evaluatedParameters(actor, seconds).energyRegeneration) || 0;
    }
    return costs;
}
export function advanceWorld(world, seconds, eventId) {
    if (!safe(seconds) || seconds <= 0 || seconds > 31536000 || !safe(world.campaign.seconds + seconds))
        fail('Введи время больше нуля, не более года за операцию.');
    const w = cloneWorld(world), end = w.campaign.seconds + seconds, initialLost = new Map(w.characters.map(c => [c.id, c.rpg.physiology.totalLostMl]));
    for (const actor of w.characters)
        applyAutomaticLife(actor, w.campaign.seconds, eventId + '-start-' + actor.id);
    let count = 0;
    while (w.campaign.seconds < end - 1e-8) {
        if (++count > 10000)
            fail('Слишком много границ событий. Продвинь время меньшим интервалом.');
        const now = w.campaign.seconds;
        for (const owner of w.characters) {
            for (const cast of owner.rpg.casts) {
                checkChargeHold(owner, cast, now, end);
                if (cast.status === 'preparing' && !cast.roundPreparation && cast.readyAt <= now + 1e-8)
                    cast.status = 'ready';
                if (cast.status === 'maintaining' && cast.endsAt !== null && cast.endsAt <= now + 1e-8)
                    cast.status = 'ended';
                if (cast.status === 'maintaining') {
                    const deprived = Object.entries(cast.ability.upkeep).some(([k, v]) => v > 0 && Number(owner.resources[k].current) <= 1e-8);
                    let impossible = false;
                    try {
                        requirements(owner, cast.ability, cast.input, now);
                    }
                    catch {
                        impossible = true;
                    }
                    if (deprived || impossible)
                        cast.status = 'interrupted';
                }
            }
        }
        for (const target of w.characters) {
            target.rpg.effects = target.rpg.effects.filter(e => {
                if (e.expiresAt !== null && e.expiresAt <= now + 1e-8)
                    return false;
                if (!e.ownerId || !e.castId)
                    return true;
                const cast = w.characters.find(c => c.id === e.ownerId)?.rpg.casts.find(c => c.id === e.castId);
                return !!cast && cast.status !== 'interrupted';
            });
            clampResources(target, now);
        }
        let dt = end - now;
        for (const actor of w.characters) {
            for (const e of actor.rpg.effects)
                if (e.expiresAt !== null && e.expiresAt > now)
                    dt = Math.min(dt, e.expiresAt - now);
            for (const c of actor.rpg.casts)
                if (c.status === 'preparing' && !c.roundPreparation && c.readyAt > now)
                    dt = Math.min(dt, c.readyAt - now);
            const costs = ongoingCosts(actor, now);
            for (const k of ['mana', 'shadow', 'stamina'])
                if (costs[k] > 0 && Number(actor.resources[k].current) <= 1e-8 && actor.rpg.casts.some(c => c.status === 'ready' && c.roundPreparation && (c.ability.chargePolicy?.holdCost[k] ?? 0) > 0))
                    fail('Не хватает ресурса ' + k + ' для удержания заряда «' + actor.name + '». Требуется решение мастера о прерывании.');
            for (const k of ['mana', 'shadow', 'stamina'])
                if (costs[k] > 0 && Number(actor.resources[k].current) > 1e-8)
                    dt = Math.min(dt, Number(actor.resources[k].current) / costs[k]);
            const p = actor.rpg.physiology;
            if (p.normalMl > 0 && p.mode !== 'none') {
                const support = activeEffects(actor.rpg, now).reduce((s, e) => s + e.substituteMl, 0);
                if (p.mode === 'blood') {
                    const loss = Object.values(actor.body.parts).reduce((s, x) => s + (x.bleedingMlPerSecond ?? 0), 0) - p.naturalMlPerSecond - activeEffects(actor.rpg, now).reduce((s, e) => s + e.bloodMlPerSecond, 0);
                    if (loss > 0)
                        for (const f of [p.weakFraction, p.impairedFraction, p.criticalFraction, ...(actor.body.anatomy?.automatic ? [actor.body.anatomy.unconsciousDeficit, actor.body.anatomy.lethalDeficit] : [])]) {
                            const until = (p.currentMl - ((1 - f) * p.normalMl - support)) / loss;
                            if (until > 1e-6)
                                dt = Math.min(dt, until);
                        }
                }
                else {
                    const max = Number(effectiveActor(actor, now).resources[p.mode].maximum), cost = costs[p.mode];
                    if (max > 0 && cost > 0)
                        for (const f of [p.weakFraction, p.impairedFraction, p.criticalFraction, ...(actor.body.anatomy?.automatic ? [actor.body.anatomy.unconsciousDeficit, actor.body.anatomy.lethalDeficit] : [])]) {
                            const threshold = ((1 - f) * p.normalMl - support) / p.normalMl * max, until = (Number(actor.resources[p.mode].current) - threshold) / cost;
                            if (until > 1e-6)
                                dt = Math.min(dt, until);
                        }
                }
            }
        }
        if (dt <= 1e-8)
            fail('Не удалось определить границу времени; проверь расходы поддержания.');
        for (const actor of w.characters) {
            const p = actor.rpg.physiology;
            if (p.mode === 'blood' && p.normalMl > 0 && !actor.rpg.dead) {
                const rate = Object.values(actor.body.parts).reduce((s, p) => s + (p.bleedingMlPerSecond ?? 0), 0);
                const regen = p.naturalMlPerSecond + activeEffects(actor.rpg, now).reduce((s, e) => s + e.bloodMlPerSecond, 0);
                const actualLost = Math.min(rate * dt, p.currentMl + regen * dt);
                p.currentMl = round(Math.min(p.normalMl, Math.max(0, p.currentMl + (regen - rate) * dt)));
                p.totalLostMl = round(p.totalLostMl + actualLost);
            }
            if ((p.mode === 'mana' || p.mode === 'shadow') && p.normalMl > 0 && !actor.rpg.dead) {
                const max = Number(effectiveActor(actor, now).resources[p.mode].maximum), rate = Object.values(actor.body.parts).reduce((s, x) => s + (x.bleedingMlPerSecond ?? 0), 0);
                const lost = max > 0 ? Math.min(rate * dt, Number(actor.resources[p.mode].current) / max * p.normalMl) : 0;
                p.totalLostMl = round(p.totalLostMl + lost);
            }
            const costs = ongoingCosts(actor, now);
            for (const k of ['mana', 'shadow', 'stamina'])
                actor.resources[k].current = String(round(Math.min(Number(effectiveActor(actor, now).resources[k].maximum), Math.max(0, Number(actor.resources[k].current) - costs[k] * dt))));
        }
        w.campaign.seconds = round(now + dt);
        for (const actor of w.characters)
            applyAutomaticLife(actor, w.campaign.seconds, eventId + '-life-' + count + '-' + actor.id);
    }
    w.campaign.seconds = end;
    for (const owner of w.characters)
        for (const cast of owner.rpg.casts) {
            checkChargeHold(owner, cast, end);
            if (cast.status === 'preparing' && !cast.roundPreparation && cast.readyAt <= end)
                cast.status = 'ready';
            if (cast.status === 'maintaining') {
                let impossible = false;
                try {
                    requirements(owner, cast.ability, cast.input, end);
                }
                catch {
                    impossible = true;
                }
                if (cast.endsAt !== null && cast.endsAt <= end)
                    cast.status = 'ended';
                else if (impossible || Object.entries(cast.ability.upkeep).some(([k, v]) => v > 0 && Number(owner.resources[k].current) <= 1e-8))
                    cast.status = 'interrupted';
            }
        }
    for (const actor of w.characters) {
        actor.rpg.effects = actor.rpg.effects.filter(e => (e.expiresAt === null || e.expiresAt > end) && (!e.ownerId || w.characters.find(c => c.id === e.ownerId)?.rpg.casts.find(c => c.id === e.castId)?.status !== 'interrupted'));
        clampResources(actor, end);
        applyAutomaticLife(actor, end, eventId + '-end-' + actor.id);
    }
    const details = w.characters.map(c => c.name + ': потеря крови ' + round(c.rpg.physiology.totalLostMl - (initialLost.get(c.id) ?? 0)) + ' мл; ' + physiologyStatus(c, end).label).join('\n');
    logWorld(w, eventId, 'Время +' + seconds + ' с → ' + end + ' с', details, w.characters.map(c => c.id));
    w.campaign.revision++;
    if (!w.characters.every(isCharacterDraft) || !isCampaign(w.campaign))
        fail('После расчёта получились недопустимые значения. Ничего не изменено.');
    return w;
}
export function worldFrom(characters, campaign) { return { characters: characters.map(c => ({ ...normalizeCharacterDraft(c), id: c.id })), campaign }; }
export function removeEffect(world, targetId, effectId, eventId) {
    const w = cloneWorld(world), target = w.characters.find(c => c.id === targetId), effect = target?.rpg.effects.find(e => e.id === effectId);
    if (!target || !effect)
        fail('Эффект не найден.');
    target.rpg.effects = target.rpg.effects.filter(e => e.id !== effectId);
    const cast = w.characters.find(c => c.id === effect.ownerId)?.rpg.casts.find(c => c.id === effect.castId);
    if (cast && cast.status === 'maintaining')
        cast.status = 'interrupted';
    clampResources(target, w.campaign.seconds);
    logWorld(w, eventId, 'Снят эффект: ' + effect.name, 'Решение мастера.', [targetId]);
    w.campaign.revision++;
    return w;
}
export function availableAreas(actor) { return bodyRegionDefs(actor.body).filter(r => actor.body.parts[r.key].present); }
export const usablePart = (actor, key) => actor.body.parts[key] && !['absent', 'disabled'].includes(partCondition(actor.body.parts[key])) && !(actor.body.parts[key].injuries ?? []).some(i => i.blocksUse) && !(actor.body.anatomy?.structures ?? []).some(s => s.region === key && !!s.functionGroup && structureBlocked(s));
export function modifiersText(ms) { return ms.map(m => parameterFields.find(p => p.key === m.parameter)?.label + ': ' + m.flat + '; ' + m.percent + '%').join('; '); }
// Изменение состояния не лечит раны. Отметка смерти сохраняется до решения мастера.
export function applyAutomaticLife(actor, seconds, eventId) {
    const a = actor.body.anatomy;
    if (!a?.automatic)
        return;
    const deficit = physiologyStatus(actor, seconds).deficit;
    const before = actor.rpg.dead ? 'dead' : actor.body.consciousness;
    const previousOverride = a.override;
    if (a.override && (a.override.revision !== a.harmRevision || deficit > a.lastDeficit + 1e-8))
        a.override = null;
    a.lastDeficit = deficit;
    const result = automaticLife(a, deficit, Object.entries(actor.body.parts).filter(([, p]) => !p.present).map(([key]) => key), false);
    if (a.override) {
        actor.rpg.dead = a.override.state === 'dead';
        actor.body.consciousness = a.override.state === 'awake' ? 'awake' : 'unconscious';
    }
    else if (!actor.rpg.dead) {
        actor.rpg.dead = result.dead;
        actor.body.consciousness = result.unconscious ? 'unconscious' : 'awake';
    }
    if (actor.rpg.dead)
        actor.body.consciousness = 'unconscious';
    const after = actor.rpg.dead ? 'dead' : actor.body.consciousness;
    if (before !== after || previousOverride && !a.override) {
        const log = { id: eventId.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 160) || 'auto-life', seconds, text: 'Состояние: ' + ({ dead: 'погиб', awake: 'в сознании', unconscious: 'без сознания' }[after]), details: (previousOverride && !a.override ? 'Решение мастера перестало действовать после нового ухудшения. ' : '') + result.reasons.join('; ') };
        if (!actor.rpg.logs.some(x => x.id === log.id))
            actor.rpg.logs = [...actor.rpg.logs, log].slice(-200);
    }
}
export function recalculateLife(actor, seconds, eventId) {
    const next = { ...normalizeCharacterDraft(actor), id: actor.id };
    applyAutomaticLife(next, seconds, eventId);
    return next;
}
export function masterLifeOverride(actor, seconds, state, reason, eventId) {
    if (!['awake', 'unconscious', 'dead'].includes(state) || !reason.trim() || reason.length > 1000 || !eventId || eventId.length > 160 || !/^[a-zA-Z0-9:_-]+$/.test(eventId) || actor.rpg.logs.some(l => l.id === eventId))
        throw new Error('Укажи причину решения мастера (до 1000 знаков).');
    const next = { ...normalizeCharacterDraft(actor), id: actor.id };
    if (next.body.anatomy) {
        next.body.anatomy.override = { state, reason: reason.trim(), revision: next.body.anatomy.harmRevision };
        next.body.anatomy.lastDeficit = physiologyStatus(next, seconds).deficit;
    }
    next.rpg.dead = state === 'dead';
    next.body.consciousness = state === 'awake' ? 'awake' : 'unconscious';
    next.rpg.logs = [...next.rpg.logs, { id: eventId, seconds, text: 'Решение мастера: ' + ({ dead: 'погиб', awake: 'в сознании', unconscious: 'жив, без сознания' }[state]), details: reason.trim() + '. Травмы и кровь сохранены; новое ухудшение запускает автоматическую проверку.' }].slice(-200);
    return next;
}

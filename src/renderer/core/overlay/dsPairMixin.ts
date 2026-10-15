// @ts-nocheck -- verbatim legacy JS lifted from the overlays (see tools/parity/drift-check.ts); type it when it is rewritten, not while it is moved.
/**
 * What gen4 and gen5 -- the DS pair, the closest twins of the five -- compute and do
 * identically: the battle-slot shortcuts (`play`, `ally`, `oppA`, `oppB`, `wild`), the
 * physical/special damage calculation and its status/ability/plate helpers, EV and IV
 * readouts, the rival's starter, the RNG-trip modal, Voltorb Flip styling and the
 * Super Shuckie fault check.
 *
 * Byte-identical in `games/gen4/Overlay.vue` and `games/gen5/Overlay.vue` and moved out
 * unchanged (tools/parity/drift-check.ts). The state (`rng_config`, `rng_npcs`,
 * `showRNGModal`, `disallow_faults`, `starter_choice`, the data tables) stays in each
 * overlay's `data()`; `closeRNGModal` and `isDevMode` stay in the overlays because they
 * reach each generation's own storage module.
 */

import type { ComponentOptionsMixin } from "vue";

// The legacy scripts assigned these without declaring them (sloppy-mode globals); the lift
// declares them as module-level `let`s in each overlay, and the methods that moved here
// (`damageCalculation`, `getNature`, `getSoloNature`) keep that shape.
// Each assigns before it reads, so a separate variable per module changes nothing;
// tools/port/check-undefined.ts over this file is the guard.
let damageMax, damageMin, maxPercentage, minPercentage, nature, part1, part2, part3, part4, pid;

export const dsPairMixin = {
    methods: {
        //DAMAGE CALCULATION
        damageCalculation(userPkmnData, targetPkmnData, move) {
            if (this.game.properties.meta.state.value != `Battle`) { return "" }
            //Setup data for calculation
            var lvl = userPkmnData.level.value
            var userAttack = userPkmnData.attack.value
            var userSpecial = userPkmnData.special.value
            var userType1 = userPkmnData.type_1.value
            var userType2 = userPkmnData.type_2.value
            
            var targetDefense = targetPkmnData.defense.value
            var targetSpecial = targetPkmnData.special.value
            var targetMaxHp = targetPkmnData.hp_max.value
            var targetType1 = targetPkmnData.type_1.value
            var targetType2 = targetPkmnData.type_2.value
            var defenderScreen = undefined

            var moveData = this.gen1moves.find(x => x.Move.toUpperCase() === move)
            var moveType = moveData.Type
            var movePower = moveData.Power
            var moveCategory = moveData.Category
            
            var stab = 1
            var AttackingTypeEffectiveness = this.typeData.find(x => x.moveType === moveType)
            var critical = 1
            var screens = 1

            var userOffensiveStat = undefined
            var targetDefensiveStat = undefined

            var AttackingTypeEffectiveness = this.typeData.find(x => x.moveType === moveType)
            var type1 = AttackingTypeEffectiveness[targetType1]
            var type2 = AttackingTypeEffectiveness[targetType2]

            //Check values & update modifiers
            if (moveType == userType1 || moveType == userType2) {
                stab = 1.5
            }
            if (moveCategory == "Physical") {
                userOffensiveStat = userAttack
                targetDefensiveStat = targetDefense
                defenderScreen = targetPkmnData.effects.reflect.value
            }
            if (moveCategory == "Special") {
                userOffensiveStat = userSpecial
                targetDefensiveStat = targetSpecial
                defenderScreen = targetPkmnData.effects.lightscreen.value
            }
            if (moveCategory == "Status") {
                return ""
            }
            if (defenderScreen == true) {
                screens = .5
            }
            //Run damage calculation
            part1 = Math.floor(Math.floor((2 * lvl * critical)/5 + 2) * movePower * userOffensiveStat)
            part2 = Math.floor(part1/targetDefensiveStat)
            part3 = Math.floor(part2/50) + 2
            part4 = undefined
            if (targetType1 == targetType2) {
                part4 = Math.floor(Math.floor(Math.floor(part3 * stab) * type1) * screens)
            }
            else {
                part4 = Math.floor(Math.floor(Math.floor(Math.floor(part3 * stab) * type1) * type2) * screens)
            }
            //Results to return
            damageMin = Math.floor(part4 * (217/255))
            damageMax = part4
            minPercentage = Math.round((damageMin/targetMaxHp) * 100)
            maxPercentage = Math.round((damageMax/targetMaxHp) * 100)
            var recoilMin = 0
            var recoilMax = 0
            if (move == "TAKE DOWN" || move == "SUBMISSION" || move == "DOUBLE-EDGE") {
                recoilMin = Math.floor(damageMin * 0.25)
                recoilMax = Math.floor(damageMax * 0.25)
            }

            return [damageMin, damageMax, minPercentage, maxPercentage, recoilMin, recoilMax,]
        },
        statusConditionConverter(statusCondition) {
            if (statusCondition) {
                if (this.game.properties.meta.generation == 1) {
                    return
                }
                if (this.game.properties.meta.generation == 2) {
                    return
                }
                if (this.game.properties.meta.generation == 3) {
                    return
                }
                if (this.game.properties.meta.generation == 4) {
                    switch (statusCondition) {
                        case "Asleep":         return "SLP"
                        case "Poisoned":       return "PSN"
                        case "Burned":         return "BRN"
                        case "Frozen":         return "FRZ"
                        case "Paralyzed":      return "PAR"
                        case "Badly Poisoned": return "PSN"
                        default:               return ""
                    }
                }
                if (this.game.properties.meta.generation.value == 5) {
                    return
                }
            }
            else return ""
        },
        statusOpacityLabel(status) {
            if (status) {
                return `opacity: ${this.statLabelOpacityValue};`
            }
            else
                return
        },
        enemy_status(status) {
            switch (status) {
                case "Paralyzed"     : return "PRZ"
                case "Burned"        : return "BRN"
                case "Frozen"        : return "FRZ"
                case "Asleep"        : return "SLP"
                case "Poisoned"      : return "PSN"
                case "Badly Poisoned": return "PSN"
                default: return ""
            }
        },
        arceus_plate_check() {
            const held_item = this.game.properties.player.team[0].held_item.value 
            switch (held_item) {
                case "Dread Plate":  return "Dark"
                case "Draco Plate":  return "Dragon"
                case "Earth Plate":  return "Ground"
                case "Fist Plate":   return "Fighting"
                case "Flame Plate":  return "Fire"
                case "Icicle Plate": return "Ice"
                case "Insect Plate": return "Bug"
                case "Iron Plate":   return "Steel"
                case "Meadow Plate": return "Grass"
                case "Mind Plate":   return "Psychic"
                case "Pixie Plate":  return "Fairy"
                case "Sky Plate":    return "Flying"
                case "Splash Plate": return "Water"
                case "Spooky Plate": return "Ghost"
                case "Stone Plate":  return "Rock"
                case "Toxic Plate":  return "Poison"
                case "Zap Plate":    return "Electric"
                default:             return "Normal"
            }
        },
        enemy2Faint(slotIndex) {
            let fainted = false
            if (this.game.properties.battle.opponent_2.team[slotIndex].stats.hp.value == 0) {
                fainted = true
            }
            if (fainted == true) {
                return "opacity: .35; filter: grayscale(100%);"
            }
            else {
                return
            }
        },
        getNature(pid) { //Pass ins the PID (Personality ID also known as the Personality Value)
            let index = pid.value % 25
            nature = Object.values(this.natures).find(x => x.index === index)
            return nature
        },
        getSoloNature() {
            pid = this.game.properties.player.team[0].internals.personality_value
            if (this.game.properties.meta.state.value == `No Pokemon`) {
                return ""
            }
            else {
                return this.getNature(pid)
            }
        },
        getTrainer(trainer) {
            return this.trainerData.find(x => x.trainer_name === trainer)
        },
        extractTrainerInfo(trainers) {
            const result = [];
            for (const key in trainers) {
                if (trainers.hasOwnProperty(key)) {
                    const trainer = trainers[key];
                    const infoString = `${trainer.name}_${trainer.rom_id}`;
                    result.push(infoString);
                }
            }
            return result;
        },
        martSelector() {
            if (this.game.properties.overworld.map_name.value == "CELADON_CITY - DEPARTMENT_STORE_5F") { return "EVs"}
            else {
                return null }
        },
        get_effort_values() {
            const ev_hp  = this.game.properties.player.team[0].evs.hp.value
            const ev_atk = this.game.properties.player.team[0].evs.attack.value
            const ev_def = this.game.properties.player.team[0].evs.defense.value
            const ev_spa = this.game.properties.player.team[0].evs.special_attack.value
            const ev_spd = this.game.properties.player.team[0].evs.special_defense.value
            const ev_spe = this.game.properties.player.team[0].evs.speed.value
            const total = ev_hp + ev_atk + ev_def + ev_spa + ev_spd + ev_spe
            return total + "/510"
        },
        get_iv_total() {
            const iv_hp  = this.game.properties.player.team[0].ivs.hp.value
            const iv_atk = this.game.properties.player.team[0].ivs.attack.value
            const iv_def = this.game.properties.player.team[0].ivs.defense.value
            const iv_spa = this.game.properties.player.team[0].ivs.special_attack.value
            const iv_spd = this.game.properties.player.team[0].ivs.special_defense.value
            const iv_spe = this.game.properties.player.team[0].ivs.speed.value
            const total = iv_hp + iv_atk + iv_def + iv_spa + iv_spd + iv_spe
            return total + "/186"
        },
        ivparser(fourByteIvBlock, ivName) { //ie: 0x00000000, "hp"
            function getBits(a, b, d) {
                return (a >> b) & ((1 << d) - 1);
            }
            switch (ivName) {
                case "hp":  return getBits(fourByteIvBlock, 0, 5);
                case "atk": return getBits(fourByteIvBlock, 5, 5);
                case "def": return getBits(fourByteIvBlock, 10, 5);
                case "spe": return getBits(fourByteIvBlock, 15, 5);
                case "spa": return getBits(fourByteIvBlock, 20, 5);
                case "spd": return getBits(fourByteIvBlock, 25, 5);
                case "egg": return getBits(fourByteIvBlock, 30, 1);
                case "ability": return getBits(fourByteIvBlock, 31, 1);
                default: return "ERROR";
            }
        },
        expPercentageCalculation(x) {
            if ((x*100) > 100)
                return 100
            else if ((x*100) < 0)
                return 0
            else
                return x * 100
        },
        //fixes species that contain special characters in their names
        speciesSpecialCharacters(species) {
            switch (species) {
                case "Mr. Mime":   return "Mr. Mime"
                case "MrMime":     return "Mr. Mime"
                case "Mr Mime":    return "Mr. Mime"
                case "Farfetchd":  return "Farfetch'd"
                case "Mime Jr.":   return "Mime Jr."
                case "Mime Jr":    return "Mime Jr."
                case "MimeJr":     return "Mime Jr."
                case "HoOh":       return "Ho-oh"
                case "Ho Oh":      return "Ho-oh"
                default:           return species
            }
        },
        //TYPE ICONS FOR THE STARTER SELECTION
        starterTypeCheck() {
            if (this.pick == true)
                var starterType1 = this.gen3data.find(y => y.dexNumber === this.starter)
                var starterType2 = this.gen3data.find(y => y.dexNumber === this.starter)
                if (starterType2.type2 == null)
                    return true
                else   
                    return false
        },
        async disallow_faults_function() {
            this.disallow_faults = true
            await this.sleep(this.disallow_delay)
            this.disallow_faults = false
        },
        voltorb_flip_style(voltorb_flip_card_value) {
            if (voltorb_flip_card_value == 2 || voltorb_flip_card_value == 3) {
                return "opacity: .9; filter: saturate(150%);"
            }
            if (voltorb_flip_card_value == 1) {
                return "opacity: .9; filter: grayscale(100%);"
            }
            if (voltorb_flip_card_value == 'Voltorb') {
                return "opacity: .20; filter: grayscale(100%);"
            }
        },
        openRNGModal() {
            for (const npc of this.rng_npcs) {
                if (!Array.isArray(this.rng_config[npc.key]) || this.rng_config[npc.key].length === 0) {
                    this.rng_config[npc.key] = [npc.defaultItem];
                }
            }
            this.showRNGModal = true;
        },
        addRNGTrip(npcKey) {
            const npc = this.rng_npcs.find(n => n.key === npcKey);
            if (!npc) return;
            this.rng_config[npcKey].push(npc.defaultItem);
        },
        removeRNGTrip(npcKey, idx) {
            if (idx <= 0) return;
            this.rng_config[npcKey].splice(idx, 1);
        },
        rngOptionsFor(npcKey) {
            return this[npcKey] ?? {};
        },
        rngPatchValueForTrip(npcKey, tripIdx) {
            const npc = this.rng_npcs.find(n => n.key === npcKey);
            if (!npc) return 0;
            const itemName = this.rng_config[npcKey]?.[tripIdx];
            if (itemName == null) return 0;
            const lookup = this[npcKey];
            return lookup?.[itemName] ?? 0;
        },
    },
    computed: {
        play() {
            if (this.game.properties.battle.player) {
                return this.game.properties.battle.player
            }
        },
        ally() {
            if (this.game.properties.battle.ally) {
                return this.game.properties.battle.ally
            }
        },
        oppA() {
            if (this.game.properties.battle.opponent) {
                return this.game.properties.battle.opponent
            }
        },
        oppB() {
            if (this.game.properties.battle.opponentB) {
                return this.game.properties.battle.opponent_2
            }
        },
        wild() {
            if (this.game.properties.battle.wild) {
                return this.game.properties.battle.wild
            }
        },
        wild_pokemon() {
            if (this.wild_pokemon_display == false) { return false}
            const state = this.game?.properties.meta.state.value
            const id = this.game?.properties.battle.opponent.id.value
            if (id == 0 && (state == `Battle` && state == `From Battle`)) {
                return true
            }
            else {
                return false
            }
        },
        not_valid_battle_state() {
            const mod1 = this.game.properties.battle.player.active_pokemon.modifiers.attack.value
            const mod2 = this.game.properties.battle.player.active_pokemon.modifiers.defense.value
            const mod3 = this.game.properties.battle.player.active_pokemon.modifiers.special_attack.value
            const mod4 = this.game.properties.battle.player.active_pokemon.modifiers.special_defense.value
            const mod5 = this.game.properties.battle.player.active_pokemon.modifiers.speed.value
            const mod6 = this.game.properties.battle.player.active_pokemon.modifiers.accuracy.value
            const mod7 = this.game.properties.battle.player.active_pokemon.modifiers.evasion.value
            if (mod1 == "-6" && mod2 == "-6" && mod3 == "-6" && mod4 == "-6" && mod5 == "-6" && mod6 == "-6" && mod7 == "-6") {
                return true
            }
            else {
                return false
            }
        },
        stats_location() {
            if (this.game.properties.meta.state.value == "Battle") {
                return "Battle Stats"
            }
            if (this.game.properties.meta.state.value == "Overworld") {
                return "Party Stats"
            }
            if (this.game.properties.meta.state.value == "No Pokemon") {
                return "No Pokemon"
            }
        },
        effortValues() {
            let evHp  = this.game.properties.player.team[0].evs.hp.value
            let evAtk = this.game.properties.player.team[0].evs.attack.value
            let evDef = this.game.properties.player.team[0].evs.defense.value
            let evSpe = this.game.properties.player.team[0].evs.speed.value
            let evSpA = this.game.properties.player.team[0].evs.special_attack.value
            let evSpD = this.game.properties.player.team[0].evs.special_defense.value
            let sum = evHp + evAtk + evDef + evSpe + evSpA + evSpD
            return {
                totalEvs: sum,
                maximumEvs: 510,
                remaining: 510 - sum,
                percentage: this.decimalToPercentage(sum/510)
            }
        },
        exp_label_percentage() {
            switch (this.state) {
                case "No Pokemon":
                    return "0%";
                case "Battle":
                    return "0%";
                case "From Battle":
                    return "0%";
                case "To Battle":
                    return "0%";
                case "Overworld":
                    return "0%";
            }
        },
        rival_starter() {
            const game = this.game.properties.meta.game_name.value
            if (game == 'Platinum' || game == 'Diamond' || game == 'Pearl' || game == 'Diamond and Pearl') {
                let starter = this.starter_choice == 'Turtwig' ? 'Chimchar' : this.starter_choice == 'Chimchar' ? 'Piplup' : 'Turtwig'
                return starter
            }
            else if (game == 'HeartGold' || game == 'SoulSilver' || game == 'HeartGold and SoulSilver') {
                let starter = this.starter_choice == 'Chikorita' ? 'Cyndaquil' : this.starter_choice == 'Cyndaquil' ? 'Totodile' : 'Chikorita'
                return starter
            }
        },
        trainerData() {
            if (this.game.properties.meta.game_name.value == "Platinum") { return this.platinum_trainers }
            else if (this.game.meta.game_name == "HeartGold and SoulSilver") { return }
            else { return }
        },
    },
} satisfies ComponentOptionsMixin;

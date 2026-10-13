// Component code, not data: lifted in place by tools/port/lift-gen3.py (step 13).
import { typeData } from "../type-effectiveness.js";
import { generation_3_moves } from "../generation_3_moves.js";
import { gen3IsPhysicalType } from "~/core/logic/moveAccuracy";
import { isOhkoMove, ohkoPowerText } from "~/core/logic/ohkoAccuracy";
import { gen3MoveByLetters } from "../../moveLookup";
export function enemy_move_power(move_name) {
    var move_power = this.generation_3_moves[move_name].power ?? 0
    if (move_power == 0) { return "—" }
    if (move_power == 1) { return "—" }
    else return move_power
}

export function enemy_effective_power(move_name, enemy_mon, slot) {
    const state = this.g3stateVariable
    const enemy_state = this.enemyState
    if (state == 'To Battle' || state == 'Battle' || state == 'From Battle') { 
        const species = enemy_mon.species.value
        const move_data = this.generation_3_moves[move_name]
        if (move_data == undefined) { return }
        const move_type = move_data.type
        if (this.starterString == "Shedinja") {
            if (move_type != "Flying" && move_type != "Rock" && move_type != "Ghost" && move_type != "Fire" && move_type != "Dark") {
                return 0
            }
        }
        const move_base_power = this.enemy_move_power(move_name) ?? move_data.power
        const move_category = move_data.category
        const user_type_1 = this.game_data.dexData[species]?.type_1
        const user_type_2 = this.game_data.dexData[species]?.type_2
        const target_type_1 = this.game.properties.battle.yourPokemon.type1.value
        const target_type_2 = this.game.properties.battle.yourPokemon.type2.value
        if (move_base_power == "—" || move_base_power == "-") { return "—" }
        var move_effective_power = move_base_power
        var modifier_effectiveness_1 = this.typeData.find(x => x.moveType == move_type)[target_type_1]
        var modifier_effectiveness_2 = target_type_2 && move_type && (target_type_1 != target_type_2) ? this.typeData.find(x => x.moveType == move_type)[target_type_2]
            : 1
        var modifier_stab = move_type == user_type_1 ? 1.5 
            : move_type == user_type_2 ? 1.5 
            : 1
        // The battle abilities arrive in capitals ("TORRENT"); abilityModifier compares title case
        const enemy_battle = this.game.properties.battle.enemyPokemon
        const enemy_ability = String(enemy_battle.ability?.value ?? "").toUpperCase()
        const player_ability = String(this.game.properties.battle.yourPokemon.ability?.value ?? "").toUpperCase()
        var modifier_ability = this.abilityModifier(this.pascalCaseSpace(enemy_ability.toLowerCase()), move_type, 'opponent')
        // The solo's defensive abilities (pokeemerald Cmd_typecalc / AbilityBattleEffects ABILITYEFFECT_ABSORBING,
        // CalculateBaseDamage Thick Fat, src/pokemon.c:3203)
        if ((player_ability == 'LEVITATE' && move_type == 'Ground')
            || (player_ability == 'VOLT ABSORB' && move_type == 'Electric')
            || (player_ability == 'WATER ABSORB' && move_type == 'Water')
            || (player_ability == 'FLASH FIRE' && move_type == 'Fire')) {
            modifier_ability = 0 
        }
        if (player_ability == 'THICK FAT' && (move_type == 'Fire' || move_type == 'Ice')) {
            modifier_ability *= 0.5
        }
        var modifier_item = 1
        var modifier_weather = this.weatherModifier(this.game.properties.battle.field.weather.value, move_name, move_type)
        var modifier_burn = 1
        // Burn halves physical (by type) damage unless the attacker has Guts; the battle copy holds the status
        if (move_category == "Physical" && enemy_battle.status1?.value == `Burned` && enemy_ability != `GUTS`) {
            modifier_burn = 0.5
            }
        else {
            modifier_burn = 1
        }
        //Calculate effective power
        if (this.typeCalcs == true) { //Handles type effectiveness calculations in battle
            return Math.floor(move_base_power * modifier_stab * modifier_effectiveness_1 * modifier_effectiveness_2 * modifier_ability * modifier_item * modifier_weather * modifier_burn)
        }
        return move_base_power
    }
}

export function typeEffectiveness(x) { //x = move1.value
    var attackingType = this.moveType(x)
    var power = this.movePower(x)
    const enemyPokemon = this.game.properties.battle.enemyPokemon;
    var defendingTypeMono = enemyPokemon.type1.value
    var defendingType1 = defendingTypeMono;
    var defendingType2 = enemyPokemon.type2.value
    var multipliers = this.typeData.find(x => x.moveType === attackingType)
    var stabModifier = this.determineSTAB(x)
    var ability = this.abilityModifier(this.pkmn_ability, attackingType, 'player')
    var defenseAbility = 1;
    var itemBoost = this.determineItemBoost(x)
    var weatherBoost = this.weatherModifier(this.game.properties.battle.turnInfo.battleWeather.value, x, this.moveType(x))
    var burnModifier = this.burnModifier(x)
    var multi_hit_modifier = 1;
    const double_hit_moves = [
        "bonemerang",
        "Double Hit",
        "Double Iron Bash",
        "Double Kick",
        "Dragon Darts",
        "Dual Chop",
        "Dual Wingbeat",
        "Gear Grind",
        "Tachyon Cutter",
        "Triple Dive",
        "Twin Beam",
        "Twineedle",
    ];
    const triple_hit_moves = [
        "Surging Strikes",
        "Triple Dive",
        "Water Shuriken",
    ];
    if (double_hit_moves.some(m => m.toLowerCase() == x.toLowerCase())) { // the list mixes cases; was only Bonemerang
        multi_hit_modifier = 2;
    }
    if (triple_hit_moves.some(m => m.toLowerCase() == x.toLowerCase())) { // the list mixes cases; was only Bonemerang
        multi_hit_modifier = 3;
    }
    // console.log(x, double_hit_moves.includes(x.toLowerCase()), multi_hit_modifier);

    const enemyAbility = this.game.properties.battle.enemyPokemon.ability.value;
    // The target's side, folded into the power (pokeemerald CalculateBaseDamage): Explosion and Selfdestruct
    // halve its Defense; its Reflect / Light Screen halve the damage in a single battle
    const explode_modifier = ["EXPLOSION", "SELFDESTRUCT"].includes(String(x).toUpperCase().replace(/[^A-Z]/g, "")) ? 2 : 1
    let screen_modifier = 1
    if (this.g3stateVariable == "Battle") {
        const physical = gen3IsPhysicalType(attackingType)
        const side = this.game.properties.battle.flags?.enemy_side
        if (physical && side?.reflect?.value == true) { screen_modifier = 0.5 }
        if (!physical && side?.light_screen?.value == true) { screen_modifier = 0.5 }
    }
    const move_key = String(x).toUpperCase().replace(/[^A-Z]/g, "")
    // Future Sight / Doom Desire: the damage is set when the move is used, by CalculateBaseDamage alone (items and
    // the target's screens count), and lands later with no typecalc, so no STAB and no type chart
    // (pokeemerald Cmd_trysetfutureattack, src/battle_script_commands.c:8941; BattleScript_MonTookFutureAttack)
    if (move_key == "FUTURESIGHT" || move_key == "DOOMDESIRE") {
        if (power == "-" || power == null) { return power }
        return Math.floor(power * itemBoost * (this.g3stateVariable == "Battle" && !this.batt.type?.double.value ? screen_modifier : 1))
    }
    // In-battle effects on the damage, single battles (pokeemerald):
    // - Charge doubles the damage of a move whose table type is Electric (Cmd_damagecalc, src/battle_script_commands.c:1298);
    // - Mud Sport / Water Sport on any battler halve Electric / Fire power (src/pokemon.c:3215-3218);
    // - Earthquake/Magnitude into Dig, Gust/Twister into Fly, Surf/Whirlpool into Dive, and Stomp, Needle Arm,
    //   Astonish and Extrasensory into a Minimized target deal double (data/battle_scripts_1.s sDMG_MULTIPLIER).
    let battle_modifier = 1
    let foresight = false
    if (this.g3stateVariable == "Battle") {
        const flags = this.game.properties.battle.flags
        const me = flags?.player_active
        const foe = flags?.enemy_active
        const tableType = gen3MoveByLetters(this.gen3moves, move_key)?.Type
        if (me?.charged_up?.value == true && tableType == "Electric") { battle_modifier *= 2 }
        if (attackingType == "Electric" && (me?.mud_sport?.value == true || foe?.mud_sport?.value == true)) { battle_modifier *= 0.5 }
        if (attackingType == "Fire" && (me?.water_sport?.value == true || foe?.water_sport?.value == true)) { battle_modifier *= 0.5 }
        if ((["EARTHQUAKE", "MAGNITUDE"].includes(move_key) && foe?.underground?.value == true)
            || (["GUST", "TWISTER"].includes(move_key) && foe?.on_air?.value == true)
            || (["SURF", "WHIRLPOOL"].includes(move_key) && foe?.underwater?.value == true)
            || (["STOMP", "NEEDLEARM", "ASTONISH", "EXTRASENSORY"].includes(move_key) && foe?.minimized?.value == true)) {
            battle_modifier *= 2
        }
        // Foresight / Odor Sleuth: typecalc stops at the TYPE_FORESIGHT marker, so Normal and Fighting hit Ghosts
        // (Cmd_typecalc, src/battle_script_commands.c:1388-1392)
        foresight = enemyPokemon.status2?.STATUS2_FORESIGHT?.value == true || foe?.foresight?.value == true
    }
    const typeFactor = (defType) => {
        if (foresight && defType == "Ghost" && (attackingType == "Normal" || attackingType == "Fighting")) { return 1 }
        return multipliers[defType]
    }
    //IN BATTLE
    // try{ 
    //     if (this.batt.trainer[this.game_data.opponent].value == `LEADER_TATE_AND_LIZA_1` || this.batt.trainer[this.game_data.opponent].value == `MAGMA_LEADER_MAXIE_MOSSDEEP`) {
    //         return power
    //     }
    // }
    // catch {
    //     // console.log("null opponent, no double battle power")
    // }

    // One-hit KO moves show "KO" (core/logic/ohkoAccuracy.ts); with type calcs in a single battle, 0 below when
    // typecalc leaves them no effect
    const ohko = isOhkoMove(x)
    if (ohko && !(this.typeCalcs && this.g3stateVariable == "Battle" && !this.batt.type?.double.value)) {
        return ohkoPowerText()
    }

    //NOT IN BATTLE
    if(this.g3stateVariable != "Battle") {
        if (power == "-") { return power }
        return Math.floor(power * stabModifier * itemBoost * ability * burnModifier * multi_hit_modifier * explode_modifier);
    }
    // console.log(multiplier1,multiplier2,attackingType,defendingType1,defendingType2)

    //Handle double battles
    if(this.g3stateVariable == "Battle" && this.batt.type?.double.value) {
        if (power == "-") { return power }
        return Math.floor(power * stabModifier * itemBoost * ability * burnModifier * multi_hit_modifier * explode_modifier);
    }
    if (this.typeCalcs && this.g3stateVariable == "Battle") {
        let abilityImmunities = {
            "LEVITATE" : "Ground",
            "VOLT ABSORB" : "Electric",
            "WATER ABSORB" : "Water",
            "FLASH FIRE" : "Fire" 
        }
        // The damaging moves of sSoundMovesTable (pokeemerald src/battle_util.c:688); names arrive in either spelling
        let soundProofMoves = ["HYPERVOICE", "SNORE", "UPROAR"];
        if(enemyAbility == "SOUNDPROOF" && soundProofMoves.includes(move_key)) {
            return 0;
        }
        if (enemyAbility == "THICK FAT" && (attackingType == "Ice" || attackingType == "Fire")) {
            defenseAbility = .5;
        }

        // One-hit KO: no effect through the type chart, Levitate, or Wonder Guard (pokeemerald gives these
        // moves power 1, so Wonder Guard's check in Cmd_typecalc applies)
        if (ohko) {
            if (abilityImmunities[enemyAbility] == attackingType) { return 0 }
            if (defendingType1 == null) { return ohkoPowerText() }
            const factor = typeFactor(defendingType1) * (defendingType1 === defendingType2 ? 1 : typeFactor(defendingType2))
            if (enemyAbility == "WONDER GUARD" && factor <= 1) { return 0 }
            return ohkoPowerText(factor)
        }
        //STATUS MOVE
        if (power == "-") { return power }
        //LEVITATE INTERACTION
        
        else if (abilityImmunities[enemyAbility] == attackingType) {
            return 0;
        }
        //NO ENEMY DATA (HAVEN'T BATTLED SINCE RELOADING ROM OR SAVE)
        else if (defendingType1 == null) {
            return Math.floor(power * stabModifier * itemBoost * ability * burnModifier * multi_hit_modifier * explode_modifier * battle_modifier)
        }
        //ATTACKING A MONO-TYPE POKEMON
        else if (defendingType1 === defendingType2) {
            var multiplier1 = typeFactor(defendingTypeMono)
            // Wonder Guard: only super-effective moves hit (Cmd_typecalc)
            if (enemyAbility == "WONDER GUARD" && multiplier1 <= 1) { return 0 }
            return Math.floor(power * multiplier1 * stabModifier * itemBoost * weatherBoost * ability * burnModifier * defenseAbility * multi_hit_modifier * explode_modifier * screen_modifier * battle_modifier)
        }
        //ATTACKING A DUAL-TYPE POKEMON
        else if (defendingType1 != defendingType2) {
            var multipliers = this.typeData.find(x => x.moveType == attackingType)
            var multiplier1 = typeFactor(defendingType1)
            var multiplier2 = typeFactor(defendingType2)
            // console.log(multiplier1,multiplier2,attackingType,defendingType1,defendingType2)
            // Wonder Guard: only super-effective moves hit (Cmd_typecalc)
            if (enemyAbility == "WONDER GUARD" && multiplier1 * multiplier2 <= 1) { return 0 }
            return Math.floor(power * multiplier1 * multiplier2 * stabModifier * itemBoost * weatherBoost * ability * burnModifier * defenseAbility * multi_hit_modifier * explode_modifier * screen_modifier * battle_modifier)
        }
        //RETURN THE MOVES POWER IF NOTHING ELSE WORKS
        else {
            return Math.floor(power * stabModifier * burnModifier * multi_hit_modifier)
        }
    }
    // Type calcs off in a single battle: the plain power, as out of battle (it fell through to undefined)
    if (power == "-") { return power }
    return Math.floor(power * stabModifier * itemBoost * ability * burnModifier * multi_hit_modifier * explode_modifier)
}
////This needs to be updated
export function type_effectiveness(pkmnData, moveNumber, enemyData) { //pkmnData = team[0] etc
    if (this.typeCalcs == true) {
        var move_name          = pkmnData["move" + moveNumber].value
        if (move_name == null) { return "" } //stop the function if there is no move in that slot
        
        var move_type          = this.g2MoveData[move_name].Type
        var move_info          = this.typeData.find(x => x.moveType === move_type)
        var move_power         = this.movePower(move_name)
        var move_category      = "Status"
        var attacker_type1     = pkmnData.type1.value
        var attacker_type2     = pkmnData.type2.value
        var defender_type1     = enemyData.type1.value
        var defender_type2     = enemyData.type2.value
        var multiplier_stab    = 1
        var multiplier_type1   = move_info[defender_type1]
        var multiplier_type2   = 1
        var burn_modifier      = 1
        var screen_reflect     = 1
        var screen_lightscreen = 1
        var held_item          = this.determineItemBoost(move_name)
        var field_weather      = this.weatherModifier(this.game.properties.battle.weather.weatherType.value, move_name, this.moveType(move_name))
        var type_boost         = this.badgeBoostType(move_name)
        
        //update variables
        if (move_type == attacker_type1 || move_type == attacker_type2)                { multiplier_stab = 1.5 }
        if (defender_type1 != defender_type2)                                          { multiplier_type2 = this.typeData.find(x => x.moveType === move_type)[defender_type2] }
        if (move_type == "Normal" || move_type == "Fighting" || move_type == "Flying" || move_type == "Bug" || move_type == "Poison" || move_type == "Ghost" || move_type == "Ground" || move_type == "Rock" || move_type == "Steel") {
            move_category = "Physical" }
        if (move_type == "Fire" || move_type == "Water" || move_type == "Grass" || move_type == "Electric" || move_type == "Psychic" || move_type == "Ice" || move_type == "Dragon" || move_type == "Dark") {
            move_category = "Special" }
        if (enemyData.effects.reflect.value == true && move_category == "Physical")    { screen_reflect = 0.5 }
        if (enemyData.effects.lightScreen.value == true && move_category == "Special") { screen_lightscreen = 0.5 }

        //return if further updates aren't required
        if (move_power == "-")                { return move_power } //returns "-" if the move has no power
        if (this.g1stateVariable != `Battle`) { return Math.floor(move_power * multiplier_stab * held_item * type_boost) } //returns the move's base power if not in battle

        //calculate the move's effective power
        return Math.floor(move_power * multiplier_stab * multiplier_type1 * multiplier_type2 * screen_reflect * screen_lightscreen * held_item * field_weather * type_boost)
    }
    else { return this.movePower(pkmnData[moveNumber].value) }
}
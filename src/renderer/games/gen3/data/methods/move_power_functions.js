// Component code, not data: lifted in place by tools/port/lift-gen3.py (step 13).
// Implicit globals of the legacy classic script, see tools/port/lift-gen3.py.
let ivAtkBit, ivDefBit, ivHpBit, ivSpcABit, ivSpcDBit, ivSpdBit, type;
import { gen3moves } from "../gen3moves.js";
import { flailReversalPower } from "~/core/logic/movePower";
import { gen3MoveByLowerName } from "../../moveLookup";
export function movePower(y) { //y = move1.value
    if (y) { y = y.toUpperCase() }
    if (y) {
        var move = gen3MoveByLowerName(this.gen3moves, this.move_name(y).toLowerCase())
        if (y == "RETURN") {
            if (this.game.properties.player.team[0].friendship.value < 2.5)
                var friendshipValue = 2.5 
            else 
                var friendshipValue = this.game.properties.player.team[0].friendship.value
            var specialMovePower = Math.floor(friendshipValue/2.5)
            return specialMovePower
        }
        else if (y == "FLAIL" || y == "REVERSAL") {
            // The game's 48ths of the HP, not rounded percentages (core/logic/movePower.ts)
            return flailReversalPower(3, this.game.properties.player.team[0].hp.value, this.game.properties.player.team[0].maxHp.value) ?? move?.Power
        }
        else if (y == "WATER SPOUT" || y == "ERUPTION") {
            var power = (150 * this.game.properties.player.team[0].hp.value) / this.game.properties.player.team[0].maxHp.value
            if (power < 1) {
                return 1
            }
            return Math.floor(power)
        }
        else if (y == "FRUSTRATION") {
            if (this.game.properties.player.team[0].friendship.value > 252.5)
                var friendshipValue = 252.5 
            else 
                var friendshipValue = this.game.properties.player.team[0].friendship.value
            var specialMovePower = Math.floor((255-friendshipValue)/2.5)
            return specialMovePower
        }
        else if (y == "LOW KICK") {
            if (this.g3stateVariable != "Battle") { return "-" }
            if (this.dexData[this.batt.enemyPokemon.species.value]?.weight < 10) { return 20 }
            if (this.dexData[this.batt.enemyPokemon.species.value]?.weight < 25) { return 40 }
            if (this.dexData[this.batt.enemyPokemon.species.value]?.weight < 50) { return 60 }
            if (this.dexData[this.batt.enemyPokemon.species.value]?.weight < 100) { return 80 }
            if (this.dexData[this.batt.enemyPokemon.species.value]?.weight < 200) { return 100 }
            if (this.dexData[this.batt.enemyPokemon.species.value]?.weight >= 200) { return 120 }
        }
        else if (y.toUpperCase() == "HIDDEN POWER") {
            return this.hiddenPowerPowerCalc(this.game.properties.player.team[0])
        }
        else if (y == "FACADE" && ["Paralyzed", "Poisoned", "Burned", "Badly Poisoned", "Badly Posioned"].includes(this.s1.statusCondition.value)) { // toxic too (Cmd_jumpifstatus STATUS1_PSN_ANY)
            return move.Power * 2
        }
        else if (y == "FURY CUTTER") {
            let furyCutterCounter = this.game.properties.battle.yourPokemon.counters.furyCutter.value
            if (this.g3stateVariable == "Battle") {
                if ((10*(Math.pow(2, furyCutterCounter)) > 160)) { 
                    return 160 
                }
                else { 
                    return 10*(Math.pow(2, furyCutterCounter)) 
                }
            } 
            else { 
                return 10 
            }
        }
        else if (y == "SPIT UP") {
            // 100 per Stockpile; it fails with none (pokeemerald Cmd_stockpiletobasedamage, src/battle_script_commands.c:6868)
            if (this.g3stateVariable != "Battle") { return move?.Power }
            const stockpile = Number(this.game.properties.battle.flags?.player_active?.stockpile?.value)
            if (!(stockpile > 0)) { return "-" }
            return 100 * stockpile
        }
        else if (y.replace(/[^A-Z]/g, "") == "SMELLINGSALT") {
            // Double against a paralysed target, unless it is behind a Substitute (data/battle_scripts_1.s:2268-2274)
            const enemy = this.game.properties.battle.enemyPokemon
            if (this.g3stateVariable == "Battle" && enemy?.status1?.value == "Paralyzed" && this.game.properties.battle.flags?.enemy_active?.substitute?.value != true) {
                return Number(move?.Power) * 2
            }
            return move?.Power
        }
        else if (y == "ROLLOUT" || y == "ICE BALL") { // both EFFECT_ROLLOUT (Cmd_rolloutdamagecalculation)
            let rolloutTimer         = this.game.properties.battle.yourPokemon.counters.rollout.value
            let defenseCurl_flag     = this.game.properties.battle.yourPokemon.status2.STATUS2_DEFENSE_CURL.value
            let defenseCurl_modifier = defenseCurl_flag == true ? 1 : 0
            let rolloutLevel         = 0
            switch (rolloutTimer) {
                case 0: rolloutLevel = 0; break;
                case 4: rolloutLevel = 1; break;
                case 3: rolloutLevel = 2; break;
                case 2: rolloutLevel = 3; break;
                case 1: rolloutLevel = 4; break;
            }
            if (this.g3stateVariable == "Battle") {
                return 30*(Math.pow(2, rolloutLevel + defenseCurl_modifier))
            } 
            else { 
                return 30 
            }
        }
        else
            if (move) return move.Power
    }
    return null
}

// Edge case moves
export function hiddenPowerTypeCalc(x) { //x = slot number
    ivHpBit = x.ivHp % 2
    ivAtkBit = x.ivAttack % 2
    ivDefBit = x.ivDefense % 2
    ivSpdBit = x.ivSpeed % 2
    ivSpcABit = x.ivSpecialAttack % 2
    ivSpcDBit = x.ivSpecialDefense % 2
    type = this.hiddenPowerTypes[(Math.floor(((ivHpBit + (2 * ivAtkBit) + (4 * ivDefBit) + (8 * ivSpdBit) + (16 * ivSpcABit) + (32 * ivSpcDBit)) * 5)/21))]
    return type
}
export function hiddenPowerPowerCalc(x) { //x = slot number
    if (this.game.properties.player.teamCount.value == 0) { return 70 }
    ivHpBit = ((x.ivHp & 2) >> 1)
    ivAtkBit = ((x.ivAttack & 2) >> 1)
    ivDefBit = ((x.ivDefense & 2) >> 1)
    ivSpdBit = ((x.ivSpeed & 2) >> 1)
    ivSpcABit = ((x.ivSpecialAttack & 2) >> 1)
    ivSpcDBit = ((x.ivSpecialDefense & 2) >> 1)
    return Math.floor((((ivHpBit + (2 * ivAtkBit) + (4 * ivDefBit) + (8 * ivSpdBit) + (16 * ivSpcABit) + (32 * ivSpcDBit)) * 40)/63) + 30 )
}
export function weatherBallTypeCalc() {
    if(this.g3stateVariable!="Battle") {
        return "Normal";
    }
    let weatherType = {
        "Sun" : "Fire",
        "Hail" : "Ice",
        "Rain" : "Water",
        "Sandstorm" : "Rock",
        "" : "Normal",
        null : "Normal",
        undefined : "Normal",
    }
    var moveType = weatherType[this.game.properties.battle.turnInfo.battleWeather.value];
    return moveType;
}
export function g3ReturnPowerCalc(slotNumber) {
    if (slotNumber.friendship.value < 2.5) { var friendshipValue = 2.5 }
    else { var friendshipValue = slotNumber.friendship.value }
    var specialMovePower = Math.floor(friendshipValue/2.5)
    return specialMovePower
}
export function g3FrustrationPowerCalc(slotNumber) {
    var friendshipValue = slotNumber.friendship.value
    var specialMovePower = Math.floor((255 - friendshipValue)/2.5)
    if (specialMovePower == 0) {
        specialMovePower = 1
    }
    return specialMovePower
}
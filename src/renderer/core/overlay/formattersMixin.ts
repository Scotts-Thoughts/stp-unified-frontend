// @ts-nocheck -- verbatim legacy JS lifted from the overlays (see tools/parity/drift-check.ts); type it when it is rewritten, not while it is moved.
/**
 * Pure text, number, time and colour helpers shared by the four lifted overlays
 * (gens 2-5): no component state, no module dependencies, the same body wherever a
 * generation had one.
 *
 * Each was byte-identical across the overlays that defined it and was moved out
 * unchanged -- gen2/4/5 held them inline in `methods`, gen3 listed the same functions
 * from its `data/methods/text_functions.js` and `time_functions.js` as shorthand
 * members; tools/parity/drift-check.ts compares the two spellings as one and now sees
 * one copy. A generation that had no copy of a helper gains it unused. A generation
 * that needs a different one overrides it in its own `methods`, which the drift check
 * reports as a difference to be explained.
 */

import type { ComponentOptionsMixin } from "vue";

export const formattersMixin = {
    methods: {
        capitalization_format(str) {
            if (str == null) { return "" }
            return str.toLowerCase().replace(/(^|\s|\-|\.)(\w)/g, function(match, p1, p2) {
              return p1 + p2.toUpperCase();
            });
        },
        camelCase: function (str) {
            if (!str || !str.toString()) { return '' }
            return str.toString().replace(/(?:^\w|[A-Z]|\b\w)/g, function (word, index) {
                return index == 0 ? word.toUpperCase() : word.toLowerCase();
            })
        },
        pascalCaseSpace(str) {
            let words = str.split(' ');
            for (let char of words) {
                words[words.indexOf(char)] = char.charAt(0).toUpperCase() + char.slice(1);
            }
            return words.join(' ');
        },
        pascalCaseDot(str) {
            let words = str.split('.');
            for (let char of words) {
                words[words.indexOf(char)] = char.charAt(0).toUpperCase() + char.slice(1);
            }
            return words.join(' ');
        },
        stripBeforeUnderscore(inputString) {
            const underscoreIndex = inputString.indexOf('_');
            if (underscoreIndex === -1) {
                return inputString; // Return the original string if no underscore is found
            }
            return inputString.substring(underscoreIndex + 1);
        },
        nullToNone(y) {
            if (y == 0) 
                return "None"
            return y
        },
        nullToSpace(y) {
            if (y == 0) 
                return " "
            return y
        },
        ifZero(y) {
            if (y != 0) return y;
            return " ";
        },
        //INVENTORY FUNCTIONS
        itemCheck(y) {
            if (y == "--End of list--") return " ";
            return y;
        },
        checkTypes(x, y) { //x = type1.value, y = type2.value
            if (x.value == y.value)
                return true
            else
                return false
        },
        keys_function(object) {
            return Object.keys(object)
        },
        values_function(object) {
            return Object.values(object)
        },
        get_nested_property(obj, path) {
            return path.split('.').reduce((o, p) => (o || {})[p], obj);
        },
        decimalToPercentage(decimal) {
            return Math.round(decimal * 100);
        },
        decimalToHex(decimal) {
            if (typeof decimal !== 'number' || decimal !== parseInt(decimal)) {
                throw new Error('Input must be a valid integer.');
            }
            return decimal.toString(16).toUpperCase();
        },
        countSetBits(byte) { //Used to determine the number of badges the player has
            let count = 0;
            while (byte) {
                count += byte & 1;
                byte >>= 1;
            }
            return count;
        },
        getLSB(value) {
            return value & 1;
        },
        getSecondLSB(value) {
            return (value >> 1) & 1;
        },
        async colorPick() {
            return new EyeDropper().open().then(res => res.sRGBHex)
        },
        padTime(time) {
            return time.toString().padStart(2, "0")
        },
        leadZero(y) {
            if (y < 10) return "0" + y.toString();
            return y;
        },
        //GAMETIME FUNCTIONS
        gameTimeHM(h, m) {
            if (h <= 0) return m;
            if (m < 10) 
                m = "0" + m.toString();
            return `${h}:${m}`;
        },
        formatDuration(x) {
            if (x.startsWith("00:")) {
                x = x.substring(3)
            }
            if (x.startsWith(0)) {
                x = x.substring(1)
            }
            x = x.substring(0, x.length-4)
            return x
        },
        formatMilliseconds(ms) {
            // Truncate milliseconds to seconds
            const totalSeconds = Math.floor(ms / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            
            // Helper function to pad with leading zero
            const pad = (x) => x.toString().padStart(2, "0");
            
            // Progressive format: starts at "0" and grows as needed
            if (hours > 0) {
                return `${hours}:${pad(minutes)}:${pad(seconds)}`;
            } else if (minutes > 0) {
                return `${minutes}:${pad(seconds)}`;
            } else {
                return seconds.toString();
            }
        },
        getCentiseconds(ms) {
            // Convert milliseconds to centiseconds and extract only the centiseconds part
            const centiseconds = Math.floor(ms / 10) % 100;
            return centiseconds.toString().padStart(2, "0");
        },
        convertSecondsToDuration(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const remainingSeconds = seconds % 60;
        
            if (hours > 0) {
                return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
            } else if (minutes > 0) {
                return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
            } else {
                var seconds = remainingSeconds
                if (remainingSeconds < 10) { seconds = "0" + remainingSeconds.toString() }
                return `0:${String(seconds)}`
            }
        },
        split(splitName, splits) {
            var split = splits.find(x => x.trainer_name === splitName)
            if (split == undefined) return
            return split["realtime.end.hours"] + ":" + split["realtime.end.minutes"] + ":" + split["realtime.end.seconds"]
        },
        sleep(ms) {
            return new Promise((res) => setTimeout(res, ms))
        },
    },
} satisfies ComponentOptionsMixin;

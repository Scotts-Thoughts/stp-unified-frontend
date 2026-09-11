
export function padTime(time) {
    return time.toString().padStart(2, "0")
}


//GAMETIME
function gameTimeHM__shadowed_1(h, m) {
    if (m < 10) m = "0" + m.toString();
    return `${h}:`+m;
}
export function gameTimeM(m) {
    if (m < 10) 
        m = "0" + m.toString();
    return m
}

//GAMETIME FUNCTIONS
export function gameTimeHM(h, m) {
    if (h <= 0) return m;
    if (m < 10) 
        m = "0" + m.toString();
    return `${h}:${m}`;
}
export function gameTimeHMS(h, m) {
    if (h <= 0) {
        if (m <= 0) return `${s}`;
        if (s < 10) s = "0" + s.toString();
        return `${m}:${s}`;
    }
    if (s < 10) s = "0" + s.toString();
    if (m < 10) m = "0" + m.toString();
    return `${h}:${m}:${s}`;
}
export function leadZero(y) {
    if (y < 10) return "0" + y.toString();
    return y;
}
export function formatDuration(x) {
    if (x.startsWith("00:")) {
        x = x.substring(3)
    }
    if (x.startsWith(0)) {
        x = x.substring(1)
    }
    x = x.substring(0, x.length-4)
    return x
}
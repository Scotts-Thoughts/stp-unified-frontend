"""Gen 5 party Pokemon (220 bytes): decrypt, edit, re-encrypt. Mirrors encrypt_byte_data in games/gen5/Overlay.vue."""
ORDERS = [[0,1,2,3],[0,1,3,2],[0,2,1,3],[0,3,1,2],[0,2,3,1],[0,3,2,1],[1,0,2,3],[1,0,3,2],[2,0,1,3],[3,0,1,2],[2,0,3,1],[3,0,2,1],
          [1,2,0,3],[1,3,0,2],[2,1,0,3],[3,1,0,2],[2,3,0,1],[3,2,0,1],[1,2,3,0],[1,3,2,0],[2,1,3,0],[3,1,2,0],[2,3,1,0],[3,2,1,0]]

def _xor(data, seed):
    out = bytearray(data)
    for i in range(0, len(data), 2):
        seed = (0x41C64E6D * seed + 0x6073) & 0xFFFFFFFF
        k = seed >> 16
        out[i] ^= k & 0xFF
        out[i + 1] ^= k >> 8
    return out

def _order(pid):
    return ORDERS[((pid & 0x3E000) >> 13) % 24]

def blocks(raw):
    """Plain 0x80 block area of an encrypted Pokemon."""
    pid = int.from_bytes(raw[:4], "little")
    chk = int.from_bytes(raw[6:8], "little")
    x = _xor(raw[8:0x88], chk)
    o = _order(pid)
    return b"".join(bytes(x[o[i] * 0x20:o[i] * 0x20 + 0x20]) for i in range(4))

def rebuild(raw, plain):
    """Encrypted Pokemon from plain blocks; battle stats (0x88+) are left as they were."""
    pid = int.from_bytes(raw[:4], "little")
    chk = sum(int.from_bytes(plain[i:i + 2], "little") for i in range(0, 0x80, 2)) & 0xFFFF
    o = _order(pid)
    sh = bytearray(0x80)
    for i in range(4):
        sh[o[i] * 0x20:o[i] * 0x20 + 0x20] = plain[i * 0x20:i * 0x20 + 0x20]
    return bytes(raw[:6]) + chk.to_bytes(2, "little") + bytes(_xor(sh, chk)) + bytes(raw[0x88:])

def set_moves(raw, moves, pp=10):
    p = bytearray(blocks(raw))
    for i, m in enumerate(moves):
        p[0x20 + i * 2:0x22 + i * 2] = m.to_bytes(2, "little")
        p[0x28 + i] = pp
    return rebuild(raw, p)

def moves(raw):
    p = blocks(raw)
    return [int.from_bytes(p[0x20 + i * 2:0x22 + i * 2], "little") for i in range(4)], list(p[0x28:0x2C])

def species(raw):
    return int.from_bytes(blocks(raw)[:2], "little")

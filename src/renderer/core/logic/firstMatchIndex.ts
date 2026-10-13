/**
 * The lifted overlays look a move up in their move list with `list.find(x => key(x) === name)`,
 * from the template, several times per move per render: gen3 about 40 scans of its 358 moves
 * per render in battle, gen2 about 150 of its 314 (docs/performance-followups.md, fourth pass).
 * gen2's list spells five moves twice; `find`, and so this, returns the first.
 *
 * `firstMatchIndex(key)` returns a lookup that gives what that `find` gave -- the *first*
 * element, in list order, whose key equals `name`, or `undefined` -- with the keys indexed once
 * per list. Pass the list the component holds (its reactive proxy): the index then holds the
 * same reactive elements `find` returned, and reading `list.length` on every lookup keeps the
 * render's dependency on the list growing.
 *
 * A list may only grow by appending (gen2's backport importer pushes moves onto `gen2moves`):
 * a miss re-checks the length and rebuilds when it moved. A hit cannot go stale, since an
 * appended element can never come before an existing match.
 */
interface Index<T> {
    byKey: Map<string, T>;
    size: number;
}

export function firstMatchIndex<T>(keyOf: (item: T) => string) {
    const indexes = new WeakMap<readonly T[], Index<T>>();

    function build(list: readonly T[]): Index<T> {
        const byKey = new Map<string, T>();
        for (const item of list) {
            const key = keyOf(item);
            if (!byKey.has(key)) byKey.set(key, item);
        }
        const index = { byKey, size: list.length };
        indexes.set(list, index);
        return index;
    }

    return function lookup(list: readonly T[], name: string): T | undefined {
        const size = list.length;
        let index = indexes.get(list) ?? build(list);
        let item = index.byKey.get(name);
        if (item === undefined && size !== index.size) {
            index = build(list);
            item = index.byKey.get(name);
        }
        return item;
    };
}

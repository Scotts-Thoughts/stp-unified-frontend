// @ts-nocheck -- lifted overlay code (gens 4-5); typed when the overlays are rewritten.
/**
 * Mid-run evolution of the Solo Pokemon, gens 4 and 5 (2026-11-24).
 *
 * The run's Pokemon is the party lead whose personality value was seen while its species was the
 * Solo Pokemon (`evolution_lead_pvs`). With Evolution on, when that same Pokemon is now another member
 * of the Solo Pokemon's family, it evolved: the starter follows, the counts carry over, the evolved
 * species gets the Evolution flags, and the art cross-fades.
 *
 * Why it reads the party as it is now: the old check ran only inside the lead's species event and
 * needed that event's old value to be a real species. A Rare Candy evolution in HeartGold (Yanma to
 * Yanmega) was missed that way. The check now also runs from the personality-value handler and on
 * every `meta.state` change, so one odd event can't lose an evolution.
 *
 * Why the flags are copied: they are stored per Solo Pokemon, and nothing wrote them for the evolved
 * one, so the queuer's /refresh or a restart after any evolution switched Evolution off.
 *
 * Gen3 keeps its own handler: its starter stays the base species through an evolution.
 *
 * `storage` is the generation's `MyStorage`; `dex(vm)` its active pokedex; `flagsInEvoStateKey` says
 * where the generation keeps the Evolution flags (gen4 `evoState_<Game>_<Species>`, gen5 the species key).
 */
export function leadEvolutionMixin(storage, { dex, flagsInEvoStateKey }) {
    return {
        methods: {
            trackEvolutionLead() {
                // Remembers which Pokemon is the run's: the party lead's personality value while the lead
                // is the Solo Pokemon. An evolution keeps the personality value, so a later lead of another
                // species in the family with this value is that Pokemon evolved (checkLeadEvolution).
                const lead = this.game?.properties?.player?.team?.[0];
                const pv = lead?.internals?.personality_value?.value;
                if (!pv || !this.starter) return;
                if (this.resolveIncomingSpecies(lead?.species?.value) !== this.starter) return;
                // A short list, not one value: gen4 debounces the species but not the personality value,
                // so a new value can land while the species still reads the Solo Pokemon from before (a
                // reset's garbage read, h-yanmega-line-2-dnf at 9223 s). With one value that read replaced
                // the real one and a later evolution was missed; here it is only one more entry.
                const pvs = (this.evolution_lead_pvs ?? []).filter(v => v !== pv);
                pvs.push(pv);
                this.evolution_lead_pvs = pvs.slice(-8);
            },
            leadEvolvedSpecies(oldProp = null) {
                // The species the run's Pokemon has evolved into, or null. Reads the party lead as it is
                // now. Evolution must be on, and the lead must be a different member of the Solo Pokemon's
                // family with the run's personality value. Before that value is known (the Solo Pokemon was
                // never seen as the lead) the legacy rule stands: the value didn't change with the species
                // and the old species wasn't empty (a fresh party).
                if (this.evolution != true || !this.starter) return null;
                const lead = this.game?.properties?.player?.team?.[0];
                const species = this.resolveIncomingSpecies(lead?.species?.value);
                const pv = lead?.internals?.personality_value?.value;
                if (!species || species === this.starter || !pv) return null;
                if (this.evolution_lead_pvs?.length) {
                    if (!this.evolution_lead_pvs.includes(pv)) return null;
                } else {
                    if (pv !== this.last_known_personality_value) return null;
                    if (oldProp && (oldProp.value == null || (Array.isArray(oldProp.bytes) && oldProp.bytes.every(b => b === 0)))) return null;
                }
                const family = (dex(this)?.[this.starter]?.evolution_family ?? []).map(obj => obj?.species).filter(s => s != null);
                // The family may list the bare name of a species the form byte resolved (Wormadam).
                return (family.includes(species) || family.includes(lead?.species?.value)) ? species : null;
            },
            async checkLeadEvolution(oldProp = null) {
                // Runs from the species and personality-value handlers and on every game-state change, so
                // an evolution is caught even when the species event itself didn't qualify (for example a
                // Rare Candy evolution out of battle whose species change arrived next to a blank read).
                // Every check also refreshes the run's Pokemon, so it never depends on which handler saw the
                // Solo Pokemon last.
                this.trackEvolutionLead();
                const newSpecies = this.leadEvolvedSpecies(oldProp);
                if (!newSpecies) return false;
                const oldSpecies = this.starter;
                const currentPersonalityValue = this.game?.properties?.player?.team?.[0]?.internals?.personality_value?.value;
                console.log("Evolving to:", newSpecies)
                console.log("Showing base stats.")
                this.stats_setting = "Base Stats";

                // Preserve attempt_number, finished_run_count, resets, and blackouts when evolving
                const preservedAttemptNumber = this.attempt_number;
                const preservedFinishedRunCount = this.finished_run_count;
                const preservedResets = this.playerResets;
                const preservedBlackouts = this.blackout_counter;

                // Update starter
                this.starter = newSpecies;
                this.last_known_species = newSpecies;
                this.last_known_personality_value = currentPersonalityValue;

                // Restore preserved values after starter update (before watcher loads from storage)
                this.attempt_number = preservedAttemptNumber;
                this.finished_run_count = preservedFinishedRunCount;
                this.playerResets = preservedResets;
                this.blackout_counter = preservedBlackouts;

                // The evolution flags are stored per Solo Pokemon, and nothing else writes them for the
                // evolved one, so a refresh or restart after the evolution turned Evolution off.
                if (flagsInEvoStateKey) {
                    // gen4: the dedicated non-style key (getEvolutionStateStorageKey, now the evolved species)
                    const evoStateKey = this.getEvolutionStateStorageKey();
                    storage[evoStateKey] = {
                        ...(storage[evoStateKey] || {}),
                        evolution: true,
                        evolution_splits_label: this.evolution_splits_label,
                    };
                }

                // Save preserved values to storage for the new species
                const game = this.game?.properties.meta.game_name.value;
                if (!storage[`${game}_${newSpecies}`]) {
                    storage[`${game}_${newSpecies}`] = {};
                }
                storage[`${game}_${newSpecies}`] = {
                    ...storage[`${game}_${newSpecies}`],
                    // gen5 keeps the flags in the species key itself
                    ...(flagsInEvoStateKey ? {} : { evolution: true, evolution_splits_label: this.evolution_splits_label }),
                    // The starter watcher shows the family member stored under the new starter's key when
                    // there is one. A stale choice there (Yanma, saved while Yanmega was the Solo Pokemon in
                    // an earlier session) kept the old art after the evolution: "Evolving to: Yanmega", the
                    // starter changed, and the overlay still drew Yanma. The evolved species is the choice now.
                    selected_evolution_species: newSpecies,
                    attempt_number: preservedAttemptNumber,
                    finished_run_count: preservedFinishedRunCount,
                    playerResets: preservedResets,
                    blackout_counter: preservedBlackouts
                };

                // Update the dropdown to the new evolved species
                // This will trigger the watcher to load the new species' styles
                this.selected_evolution_species = newSpecies;

                // Show base stats of new evolved species until next battle
                this.show_evolved_base_stats = true;
                this.evolved_species_for_stats = newSpecies;

                // Perform fade transition
                await this.performEvolutionTransition(oldSpecies, newSpecies);
                return true;
            },
        },
    };
}

<template>
	<div class="testingArea1" style="z-index: 50000;"><interface_1/></div>
	<div class="testingArea2" style="z-index: 50000;">
		<interface_2/>
		<metrics />
		<encounters />
		<br>
		<dvs />
	</div>
	<div class="testingArea4" style="z-index: 50000;"><interface_3 /></div>
	<div class="testingArea3" style="z-index: 50000;"><interface_4 /></div>
</template>

<script>
import { defineComponent } from "vue"
import interface_1 from "./settings/interface_1.vue";
import interface_2 from "./settings/interface_2.vue";
import metrics from "./settings/metrics.vue";
import encounters from "./settings/encounters.vue";
import dvs from "./settings/dvs.vue";
import interface_3 from "./settings/interface_3.vue";
import Interface_4 from "./settings/interface_4.vue";

export default defineComponent({
	components: {
		interface_1,
		interface_2,
		metrics,
		encounters,
		dvs,
		interface_3,
		Interface_4
	}
});
</script>
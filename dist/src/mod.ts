import { DependencyContainer } from "tsyringe";
import { IPreAkiLoadMod } from "@spt-aki/models/external/IPreAkiLoadMod";
import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { ISaveProgressRequestData } from "@spt-aki/models/eft/inRaid/ISaveProgressRequestData";
import { INullResponseData } from "@spt-aki/models/eft/httpResponse/INullResponseData";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { InraidCallbacks } from "@spt-aki/callbacks/InraidCallbacks";
import { InraidController } from "@spt-aki/controllers/InraidController";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";

import pkg from "../package.json";
import modConfig from "../config/config.json";

class Mod implements IPreAkiLoadMod, IPostDBLoadMod
{
	protected Name = `${pkg.author}-${pkg.name}`;
	protected saveSlotId: string;
	private static container: DependencyContainer;
	private logger: ILogger;

	public preAkiLoad(container: DependencyContainer): void
	{
		Mod.container = container;

		this.logger = container.resolve<ILogger>("WinstonLogger");
		this.logger.info(`Loading: ${this.Name} ${pkg.version}${modConfig.Enabled ? "" : " [Disabled]"}`);
		if (!modConfig.Enabled)
		{
			return;
		}

		if (!modConfig?.MagicItemsId?.AlwaysSurvived || !modConfig?.MagicItemsId?.NoSave)
		{
			this.logger.error(`${this.Name} - One of "MagicItemsId" doesn't have items ID to be used, mod disabled...`);
			return;
		}

        container.afterResolution("InraidCallbacks", (_t, result: InraidCallbacks) => 
        {
            result.saveProgress = (url: string, info: ISaveProgressRequestData, sessionID: string) => 
            {
                return this.saveProgress(url, info, sessionID);
            }
        },
		{ frequency: "Always" });
	}

	public postDBLoad(container: DependencyContainer): void
	{
		if (!modConfig?.UseExtraSpecialSlot) return;

		const hashUtil = Mod.container.resolve<HashUtil>("HashUtil");
		const jsonUtil = Mod.container.resolve<JsonUtil>("JsonUtil");
		const itemTables = Mod.container.resolve<DatabaseServer>("DatabaseServer").getTables().templates.items;

		for (const id in itemTables)
		{
			const item = itemTables[id];
			if (!item?._props?.Slots || !item._props.Slots[0]) continue;

			if (item._props.Slots[0]._name === "SpecialSlot1")
			{
				const copyItem = jsonUtil.clone(item._props.Slots[0]);
				copyItem._name = "SpecialSlotMagicSave";
				copyItem._id = hashUtil.generate();
				copyItem._props.filters[0].Filter = [modConfig.MagicItemsId.AlwaysSurvived, modConfig.MagicItemsId.NoSave];
				item._props.Slots.push(copyItem);
			}
		}
	}

    public saveProgress(url: string, info: ISaveProgressRequestData, sessionID: string): INullResponseData
    {
		const httpResponse = Mod.container.resolve<HttpResponseUtil>("HttpResponseUtil");
		const pmcData = Mod.container.resolve<ProfileHelper>("ProfileHelper").getPmcProfile(sessionID);
		let saveItem: string;

		if (!info?.isPlayerScav)
		{
			for (const item of pmcData.Inventory.items)
			{
				if (modConfig?.UseInventorySlots)
				{
					if (item.slotId != "hideout" && this.checkMagicItem(item._tpl))
					{
						saveItem = item._tpl;
						break;
					}
				}

				if (modConfig?.UseExtraSpecialSlot)
				{
					if (item.slotId == "Pockets")
					{
						for (const itemInPocket of pmcData.Inventory.items.filter(x => x.parentId == item._id))
						{
							if (itemInPocket.slotId !== "SpecialSlotMagicSave") continue;

							if (this.checkMagicItem(itemInPocket._tpl))
							{
								saveItem = itemInPocket._tpl;
								break;
							}
						}
					}

					if (saveItem) break;
				}
			}

			if (saveItem === modConfig.MagicItemsId.NoSave)
			{
				this.logger.success(`${this.Name}: Magic Save Item Found, No Saving...`);
				if (modConfig.RemoveNoSaveItemAfterUse) this.removeMagicItem(pmcData, saveItem);
				return httpResponse.nullResponse();
			}
			else if (saveItem === modConfig.MagicItemsId.AlwaysSurvived)
			{
				info.exit = "survived";
				this.logger.success(`${this.Name}: Magic Save Item Found, Save as Survived...`);
			}
		}
        Mod.container.resolve<InraidController>("InraidController").savePostRaidProgress(info, sessionID);
		if (modConfig.RemoveAlwaysSurvivedItemAfterUse) this.removeMagicItem(pmcData, saveItem);
        return httpResponse.nullResponse();
    }

	private removeMagicItem(pmcData: any, saveItem: string): any
	{
		if (!saveItem) return pmcData;

		for (const i in pmcData.Inventory.items)
		{
			const item = pmcData.Inventory.items[i];
			if (item.slotId != "hideout" && item._tpl === saveItem)
			{
				this.logger.debug(`Magic save item found: "${item._id}" on pmc inventory, removed...`);
				if (item?.upd?.StackObjectsCount > 1)
				{
					this.logger.debug(`Stacked item, Reduce stack instead of removeal...`);
					item.upd.StackObjectsCount--;
				}
				else
				{
					pmcData.Inventory.items.splice(i, 1);
					for (let j = 0; j < pmcData.Inventory.items.length; j++)
					{
						const childitem = pmcData.Inventory.items[j];
						if (childitem.parentId === item._id)
						{
							this.logger.debug(`Child item found: "${childitem._id}" on Magic save item's inventory, removed...`);
							pmcData.Inventory.items.splice(j--, 1);
						}
					}
				}
				break;
			}
		}

		return pmcData;
	}

	private checkMagicItem(itemTpl: string): boolean
	{
		if (itemTpl === modConfig.MagicItemsId.NoSave || itemTpl === modConfig.MagicItemsId.AlwaysSurvived)
		{
			return true;
		}

		return false;
	}
}

module.exports = {mod: new Mod()};
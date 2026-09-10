/**
 * The split names the right panel lists, per game, in run order (plan 1.2).
 *
 * These are display names and do not match the CSV keys in `autosplitter.ts`: the panel
 * shows "Surge" where a split row says "LT.SURGE_1". Both spellings are data the
 * overlay renders today, so both are preserved as-is.
 */
export const split_trainers: Record<string, string[]> = {
    "Yellow": [
        "Rival1-Lab",           
        "Rival1a-Route 22",     
        "Brock",                
        "Rival2-Nugget Bridge", 
        "Rival3-SS Anne",       
        "Misty",                
        "Erika",                
        "Surge",                
        "Rival4-Pkmn Tower",    
        "Koga",                 
        "Rival5-Silph",         
        "Sabrina",              
        "Blaine",               
        "Giovanni",             
        "Rival6-Route 22",      
        "Lorelei",              
        "Bruno",                
        "Agatha",               
        "Lance",                
        "Champion",             
    ],
    "Red and Blue": [
        "Rival1-Lab",           
        "Brock",                
        "Rival2-Nugget Bridge", 
        "Rival3-SS Anne",       
        "Misty",                
        "Erika",                
        "Surge",                
        "Rival4-Pkmn Tower",    
        "Koga",                 
        "Rival5-Silph",         
        "Sabrina",              
        "Blaine",               
        "Giovanni",             
        "Rival6-Route 22",      
        "Lorelei",              
        "Bruno",                
        "Agatha",               
        "Lance",                
        "Champion",             
    ],
}
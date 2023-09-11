import csv

self_kills_by_steam_id = {}
self_kill_count = 0

with open('kills-combined.csv', newline='') as csvfile:
    reader = csv.reader(csvfile)
    for row in reader:
        if row[1] == row[5]:
            steam_id = row[1]
            self_kills = self_kills_by_steam_id.get(steam_id, [])
            self_kills.append([row[2], row[3], row[4]]);
            self_kills_by_steam_id[steam_id] = self_kills
            self_kill_count += 1
print(self_kill_count)
sortable = []
for steam_id in self_kills_by_steam_id:
    self_kills = self_kills_by_steam_id[steam_id]
    sortable.append([len(self_kills), steam_id, self_kills])
sortable.sort(reverse=True)
for count, steam_id, self_kills in sortable:
    for kill in self_kills:
        print(str(count) + ',' + steam_id + ',' + ','.join(kill))

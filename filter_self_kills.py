import csv
import math

all_self_kills = []
kills_by_steam_id = {}
deaths_by_steam_id = {}
self_kills_by_steam_id = {}
self_kill_count = 0

def IsSteamId(s):
    if not s:
        return False
    if len(s) != 17:
        return False
    return True

def Distance(a, b):
    if len(a) != len(b):
        throw('Cannot compute distance between points of different dimension')
    sq = 0
    for x, y in zip(a, b):
        diff = float(x) - float(y)
        sq += diff * diff
    return math.sqrt(sq)

def Gauss(x):
    return math.exp(-x*x)

def Sigmoid(x, halfway):
    steepness = math.log(3) / halfway
    return 2 / (1 + math.exp(-steepness * x)) - 1

def CoordsToGridSquareAndKeypad(xyz):
    x, y, z = xyz
    x = float(x)
    y = float(y)
    z = float(z)
    if x < -2118 or x > 2118 or z < -2118 or z > 2118:
        return 'SEA', '1'
    gx = 29 * (x + 2118) / 2118 / 2
    gz = 29 * (-z + 2118) / 2118 / 2
    ix = math.floor(gx)
    iz = math.floor(gz)
    letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'AA', 'AB', 'AC']
    letter = letters[ix]
    number = str(iz)
    grid_coords = letter + number
    rx = gx - ix
    rz = gz - iz
    keypad = '1'
    if rx < 1/3:
        if rz < 1/3:
            keypad = '7'
        elif rz < 2/3:
            keypad = '4'
        else:
            keypad = '1'
    elif rx < 2/3:
        if rz < 1/3:
            keypad = '8'
        elif rz < 2/3:
            keypad = '5'
        else:
            keypad = '2'
    else:
        if rz < 1/3:
            keypad = '9'
        elif rz < 2/3:
            keypad = '6'
        else:
            keypad = '3'
    return grid_coords, keypad

def IsPointCloseToAnyBases(p, bases, threshold):
    for score, x, y, z in bases:
        b = [x, y, z]
        d = Distance(p, b)
        if d < threshold:
            return True
    return False

with open('kills-combined.csv', newline='') as csvfile:
    reader = csv.reader(csvfile)
    for row in reader:
        attacker_id = row[1]
        if not IsSteamId(attacker_id):
            continue
        victim_id = row[5]
        if not IsSteamId(victim_id):
            continue
        kill = [row[2], row[3], row[4]]
        death = [row[6], row[7], row[8]]
        if attacker_id == victim_id:
            all_self_kills.append(kill)
            self_kills = self_kills_by_steam_id.get(attacker_id, [])
            self_kills.append(kill);
            self_kills_by_steam_id[attacker_id] = self_kills
            self_kill_count += 1
        else:
            kills = kills_by_steam_id.get(attacker_id, [])
            kills.append(kill)
            kills_by_steam_id[attacker_id] = kills
            deaths = deaths_by_steam_id.get(victim_id, [])
            deaths.append(death)
            deaths_by_steam_id[victim_id] = deaths
print(self_kill_count)
sortable = []
for steam_id in self_kills_by_steam_id:
    self_kills = self_kills_by_steam_id[steam_id]
    sortable.append([len(self_kills), steam_id])
sortable.sort(reverse=True)
for count, steam_id in sortable:
    sortable_candidates = []
    self_kills = self_kills_by_steam_id[steam_id]
    for candidate in self_kills:
        self_kill_density = 0
        for kill in self_kills:
            dist = Distance(candidate, kill)
            self_kill_density += Gauss(dist / 20)
        self_kill_score = Sigmoid(self_kill_density, 2)
        ally_density = -self_kill_density
        for kill in all_self_kills:
            dist = Distance(candidate, kill)
            ally_density += Gauss(dist / 20)
        ally_score = Sigmoid(ally_density, 2)
        defense_density = 0
        for kill in kills_by_steam_id.get(steam_id, []):
            dist = Distance(candidate, kill)
            defense_density += Gauss(dist / 20)
        for kill in deaths_by_steam_id.get(steam_id, []):
            dist = Distance(candidate, kill)
            defense_density += Gauss(dist / 20)
        defense_score = Sigmoid(defense_density, 3)
        roam_density = -defense_density
        for kill in kills_by_steam_id.get(steam_id, []):
            dist = Distance(candidate, kill)
            roam_density += Gauss(dist / 1000)
        for kill in deaths_by_steam_id.get(steam_id, []):
            dist = Distance(candidate, kill)
            roam_density += Gauss(dist / 1000)
        roam_score = Sigmoid(roam_density, 5)
        base_probability = self_kill_score + 0.2 * ally_score + 0.2 * defense_score + 0.1 * roam_score
        base_probability = min(base_probability, 1)
        sortable_candidates.append([base_probability] + candidate)
    if len(sortable_candidates) == 0:
        continue
    sortable_candidates.sort(reverse=True)
    top_score = sortable_candidates[0][0]
    clustered_bases = []
    for score, x, y, z in sortable_candidates:
        top_score_ratio = score / top_score
        if len(clustered_bases) >= 5:
            # Stop at 5 estimated base locations.
            break
        if len(clustered_bases) >= 2 and top_score_ratio < 1/3:
            # Stop outputting low confidence guesses if we already have 2 good ones.
            break
        p = [x, y, z]
        if not IsPointCloseToAnyBases(p, clustered_bases, 30):
            clustered_bases.append([score, x, y, z])
    for score, x, y, z in clustered_bases:
        p = [x, y, z]
        grid_coords, keypad = CoordsToGridSquareAndKeypad(p)
        human_readable_location_string = grid_coords.ljust(4) + ' kp ' + keypad + ' '
        is_cave = float(y) < -5
        if is_cave:
            human_readable_location_string += 'cave '
        human_readable_location_string += str(round(score * 100)) + '%'
        print(steam_id + ',' + str(score) + ',' + ','.join(p) + ',' + human_readable_location_string)

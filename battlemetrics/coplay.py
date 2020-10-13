import csv
import dateutil.parser

input_filename = 'battlemetrics-sessions.tsv'
#input_filename = 'rust-sessions-small.tsv'

# A dictionary of lists of sessions.
sessions_by_server_id = {}

# A set of distinct player IDs.
player_ids = set()

session_count = 0
long_session_count = 0

# Read in a bulk dump of sessions.
with open(input_filename, newline='') as tsvfile:
    reader = csv.DictReader(tsvfile, delimiter='\t', quoting=csv.QUOTE_NONE)
    for row in reader:
        server_id = int(row['server_id'])
        assert server_id > 0
        start_time = dateutil.parser.isoparse(row['start_time']).timestamp()
        assert start_time > 0
        stop_time = row['stop_time']
        if (not stop_time) or (len(stop_time) < 10) or stop_time[0] != '2':
            continue
        stop_time = dateutil.parser.isoparse(stop_time).timestamp()
        assert stop_time > 0
        player_id = int(row['player_id'])
        player_ids.add(player_id)
        if stop_time - start_time > 86400:
            long_session_count += 1
            continue
        if server_id not in sessions_by_server_id:
            sessions_by_server_id[server_id] = []
        session = (start_time, stop_time, player_id)
        sessions_by_server_id[server_id].append(session)
        session_count += 1
        update_period = 100 * 1000
        if reader.line_num % update_period == 0:
            print(reader.line_num)
print('Done parsing', session_count, 'sessions.')
print('Distinct servers detected:', len(sessions_by_server_id))
print('Distinct players detected:', len(player_ids))
del player_ids
filtered_percent = 100 * long_session_count / (session_count + long_session_count)
print('Filtered', long_session_count, 'excessively long sessions (', '%.2f' % filtered_percent, '%)')

# Filter out servers that have less than two sessions. There is no possibility of coplay time
# registering on these servers. This is done to hopefully save memory.
original_server_count = len(sessions_by_server_id)
active_servers = {}
dead_server_count = 0
for server_id in sessions_by_server_id:
    server_sessions = sessions_by_server_id[server_id]
    if len(server_sessions) < 2:
        dead_server_count += 1
    else:
        active_servers[server_id] = server_sessions
dead_server_percent = 100 * dead_server_count / original_server_count
print('Filtered', dead_server_count, 'dead servers to save memory (', '%.2f' % dead_server_percent , '%).')
sessions_by_server_id = active_servers
print('Servers remaining:', len(sessions_by_server_id))

# Store coplaying time between pairs of players using a dict-of-dicts.
coplaying_time = {}

# Add some coplaying time between a pair of players to the existing sums.
def AddCoplayingTime(player_id_a, player_id_b, time_in_seconds):
    hi = max(player_id_a, player_id_b)
    lo = min(player_id_a, player_id_b)
    if lo not in coplaying_time:
        coplaying_time[lo] = {}
    if hi not in coplaying_time[lo]:
        coplaying_time[lo][hi] = 0
    coplaying_time[lo][hi] += time_in_seconds

# Sort the servers by the number of sessions.
# Processing them from quietest to busiest should save some memory usage.
servers_by_activity = []
for server_id in sessions_by_server_id:
    server_sessions = sessions_by_server_id[server_id]
    servers_by_activity.append((len(server_sessions), server_id))
servers_by_activity.sort()
print('Emptiest servers:')
for session_count, server_id in servers_by_activity[:10]:
    print(server_id, session_count)
print('Busiest servers:')
for session_count, server_id in servers_by_activity[-10:]:
    print(server_id, session_count)

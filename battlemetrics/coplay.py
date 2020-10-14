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

# For each server, go through its sessions and add up the total coplay time
# for each pair of players.
total_coplay_time = {}
for i, (session_count, server_id) in enumerate(servers_by_activity):
    print('Processing server', i + 1, 'of', len(servers_by_activity), '(', len(servers_by_activity) - i, 'left )')
    server_sessions = sessions_by_server_id[server_id]
    server_sessions.sort()
    server_coplay_time = {}
    active_sessions = []
    for a in server_sessions:
        a_start, a_stop, a_player = a
        new_active_sessions = [a]
        for b in active_sessions:
            b_start, b_stop, b_player = b
            overlap_start = max(a_start, b_start)
            overlap_stop = min(a_stop, b_stop)
            duration = overlap_stop - overlap_start
            if duration > 0:
                lo, hi = min(a_player, b_player), max(a_player, b_player)
                server_coplay_time[lo, hi] = server_coplay_time.get((lo, hi), 0) + duration
            if a_start < b_stop:
                new_active_sessions.append(b)
        active_sessions = new_active_sessions
    coplay_count = 0
    long_coplay_count = 0
    # TODO: calculate max edge per user per server, and make sure it passes the filter.
    for a, b in server_coplay_time:
        t = server_coplay_time[a, b]
        if t > 3 * 3600:
            total_coplay_time[a, b] = total_coplay_time.get((a, b), 0) + t
    del sessions_by_server_id[server_id]
print('DONE')

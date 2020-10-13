import csv
import dateutil.parser

# A dictionary of lists of sessions.
sessions_by_server_id = {}

session_count = 0
long_session_count = 0

# Read in a bulk dump of sessions.
with open('battlemetrics-sessions.tsv', newline='') as tsvfile:
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
filtered_percent = 100 * long_session_count / (session_count + long_session_count)
print('Filtered', long_session_count, 'excessively long sessions (', '%.2f' % filtered_percent, '%)')

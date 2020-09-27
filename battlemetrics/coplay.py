import csv
import heapq
import random

# The session count for each server.
session_count_by_server_id = {}

# Read in a bulk dump of sessions.
with open('battlemetrics-sessions.tsv', newline='') as tsvfile:
    reader = csv.DictReader(tsvfile, delimiter='\t', quoting=csv.QUOTE_NONE)
    for row in reader:
        server_id = int(row['server_id'])
        assert server_id > 0
        session_count_by_server_id[server_id] = session_count_by_server_id.get(server_id, 0) + 1
        update_period = 100 * 1000
        if reader.line_num % update_period == 0:
            print(reader.line_num)
big_server_session_threshold = 1000
big_servers = 0
big_sessions = 0
small_servers = 0
small_sessions = 0
for server_id in session_count_by_server_id:
    c = session_count_by_server_id[server_id]
    if c > big_server_session_threshold:
        big_servers += 1
        big_sessions += c
    else:
        small_servers += 1
        small_sessions += c
print(big_servers)
print(big_sessions)
print(small_servers)
print(small_sessions)

while true
do
    git pull origin main
    NOW=$(date '+%Y%m%d%H%M%S')
    FILENAME="$NOW.log"
    echo "Starting bot. Check $FILENAME for output."
    npm start > $FILENAME 2>&1
    echo "Bot stopped. Cooling down for 60 seconds."
    sleep 60
done

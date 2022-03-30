while true
do
    NOW=$(date '+%Y%m%d%H%M%S')
    echo "$NOW starting bot"
    FILENAME="$NOW.log"
    npm start > $FILENAME 2>&1
    echo "Bot stopped. Check $FILENAME for output."
    sleep 1
done

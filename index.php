<?php
  require('steamauth/steamauth.php');  
?>
<!DOCTYPE html>
<html>
  <head>
    <title>Secret Clan</title>
    <link rel="stylesheet" type="text/css" href="style.css">
    <meta name="viewport"
	  content="width=device-width, initial-scale=1, user-scalable=no">
  </head>
  <body>
    <div class="single-column">
      <?php
        if (!isset($_SESSION['steamid'])) {
  	  loginbutton('rectangle');
	} else {
          include('steamauth/userInfo.php');
      ?>
      <img src='<?=$steamprofile['avatarfull']?>'>
      <p>Welcome, <?=$steamprofile['personaname']?></p>
      <?php logoutbutton(); ?>
      <?php } ?>
    </div>
  </body>
</html>

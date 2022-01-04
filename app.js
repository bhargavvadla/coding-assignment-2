const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const app = express();

app.use(express.json());

const dbPath = path.join("twitterClone.db");

let db = null;

const startDBandServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    app.listen("4000", () => console.log(`Server started!`));
  } catch (e) {
    console.log(`DB error ${e.message}`);
  }
};

startDBandServer();

//Authentication
const authentication = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (authHeader === undefined) {
    res.status(401);
    res.send("Invalid response");
  } else {
    const hasJwtToken = authHeader.split(" ")[1];
    if (hasJwtToken === undefined) {
      res.status(401);
      res.send("Invalid JWT Token");
    } else {
      await jwt.verify(hasJwtToken, "MY_SECRET_CODE", async (err, user) => {
        if (err) {
          res.status(401);
          res.send("Invalid JWT Token");
        } else {
          req.username = user.username;
          next();
        }
      });
    }
  }
};

// API - 1
app.post("/register/", async (req, res) => {
  const { username, password, name, gender } = req.body;

  const strongPassword = password.length >= 6 ? true : false;

  if (!strongPassword) {
    res.status(400);
    res.send("Password is too short");
  } else {
    const users = await db.get(
      `SELECT * FROM user WHERE username='${username}'`
    );

    if (users !== undefined) {
      res.status(400);
      res.send("User already exists");
    } else {
      const totalUsersCount = await db.all(
        "SELECT count(*) as count FROM user"
      );
      const usersCount = totalUsersCount[0].count;
      const hashedPassword = await bcrypt.hash(password, 10);
      await db.run(`INSERT INTO user VALUES
                        (${
                          usersCount + 1
                        },'${name}','${username}','${hashedPassword}', '${gender}')`);
      res.send("User created successfully");
    }
  }
});

// API - 2
app.post("/login/", async (req, res) => {
  const { username, password } = req.body;

  const dbUser = await db.get(
    `SELECT * FROM user WHERE username='${username}'`
  );

  if (dbUser === undefined) {
    res.status(400);
    res.send("Invalid user");
  } else {
    const userAuth = await bcrypt.compare(password, dbUser.password);
    if (userAuth) {
      const payload = { username: dbUser.username };
      const jwtToken = await jwt.sign(payload, "MY_SECRET_CODE");
      console.log(jwtToken);
      res.send({ jwtToken });
    } else {
      res.status(400);
      res.send("Invalid password");
    }
  }
});

// API - 3
app.get("/user/tweets/feed/", authentication, async (req, res) => {
  const { username } = req;

  const user = await db.get(
    `SELECT user_id FROM user WHERE username='${username}'`
  );

  const userId = user.user_id;
  //   const userId = 5;
  console.log(user, userId);

  const userTweets = await db.all(`


        SELECT DISTINCT * FROM tweet
        INNER JOIN
        (
            SELECT * FROM follower
            WHERE follower_user_id = ${userId}
        )
        AS followings
            ON followings.following_user_id = tweet.user_id

        INNER JOIN user
        ON user.user_id = followings.following_user_id
        ORDER BY tweet.date_time DESC
        LIMIT 4
        `);

  res.status(200);
  res.send(
    userTweets.map((eachUser) => ({
      username: eachUser.username,
      tweet: eachUser.tweet,
      dateTime: eachUser.date_time,
    }))
  );
});

// API - 4
app.get("/user/following/", authentication, async (req, res) => {
  const { username } = req;

  const user = await db.get(
    `SELECT user_id FROM user WHERE username='${username}'`
  );

  const userId = user.user_id;
  //   const userId = 5;
  console.log(user, userId);

  const userFollowingsNames = await db.all(`
      SELECT DISTINCT name FROM user
      INNER JOIN
         (
             SELECT * from  follower
              WHERE
              follower.follower_user_id = ${userId}
        )AS followings
      ON followings.following_user_id = user.user_id
    `);

  res.status(200);
  res.send(userFollowingsNames);
});

// API - 5
app.get("/user/followers/", authentication, async (req, res) => {
  const { username } = req;

  const user = await db.get(
    `SELECT user_id FROM user WHERE username='${username}'`
  );

  const userId = user.user_id;
  //   const userId = 2;
  console.log(user, userId);

  const userFollowersNames = await db.all(`

                SELECT name FROM user
                INNER JOIN
                (
                    SELECT * from  follower
                    WHERE
                    follower.following_user_id = ${userId}
                )
                AS followers
                ON followers.follower_user_id = user.user_id 

  `);

  res.status(200);
  res.send(userFollowersNames);
});

// API - 6
app.get("/tweets/:tweetId/", authentication, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;

  const user = await db.get(
    `SELECT user_id FROM user WHERE username='${username}'`
  );

  const userId = user.user_id;
  //   const userId = 2;
  console.log(userId);

  const particularFollowingTweets = await db.all(`

            SELECT
                all_tweets.tweet,
                all_tweets.likes,
                all_tweets.replies,
                all_tweets.date_time
            FROM

                    (
                        SELECT * FROM follower
                        WHERE follower_user_id = ${userId}
                    )
                    AS followings 
                    INNER JOIN 
                    (
                        SELECT
                            likes.tweet_id,
                            likes.tweet,
                            likes.likes,
                            replies.replies,
                            likes.date_time,
                            likes.user_id
                        FROM
                            (
                                SELECT 
                                    tweet.tweet_id,
                                    tweet.tweet,
                                    tweet.user_id,
                                    count(like_id) as likes,
                                    date_time
                                FROM 
                                    (
                                        SELECT * FROM tweet
                                        
                                    ) tweet
                                    LEFT JOIN like
                                ON like.tweet_id = tweet.tweet_id

                                GROUP BY tweet.tweet_id
                            )
                            AS likes
                            INNER JOIN 
                            (
                                SELECT 
                                    tweet.tweet_id,
                                    count(reply_id) as replies
                                FROM 
                                    (
                                        SELECT * FROM tweet
                                    ) tweet
                                    LEFT JOIN reply
                                ON reply.tweet_id = tweet.tweet_id

                                GROUP BY tweet.tweet_id
                            )
                            AS replies
                        ON replies.tweet_id = likes.tweet_id
                    )
                    AS all_tweets

                    on all_tweets.user_id = followings.following_user_id

                    WHERE all_tweets.tweet_id = ${tweetId}


            `);

  if (particularFollowingTweets.length === 0) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    res.status(200);
    res.send(
      particularFollowingTweets.map((e) => ({
        tweet: e.tweet,
        userId: e.user_id,
        likes: e.likes,
        replies: e.replies,
        dateTime: e.date_time,
      }))
    );
  }
});

// API - 7
app.get("/tweets/:tweetId/likes/", authentication, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;

  const user = await db.get(
    `SELECT user_id FROM user WHERE username='${username}'`
  );

  const userId = user.user_id;
  //   const userId = 2;
  console.log(userId);

  const pFollowingTweetsLikes = await db.all(`

            SELECT username FROM USER
            INNER JOIN 
                (
                    SELECT * FROM 

                        (
                            SELECT * FROM follower
                            WHERE follower_user_id = ${userId}
                        )
                        AS followings
                        INNER JOIN
                        (   

                            SELECT
                                    p_tweet.tweet_id as tweet_id,
                                    p_tweet.user_id as tweeted_user_id,
                                    like.user_id as liked_user_id,
                                    p_tweet.tweet,
                                    date_time
                            FROM 
                                (
                                    SELECT * FROM tweet
                                    WHERE tweet_id = ${tweetId}
                                )
                                AS p_tweet
                            INNER JOIN like 
                            ON like.tweet_id = p_tweet.tweet_id
                        )
                        AS tweets

                        ON tweets.tweeted_user_id = followings.following_user_id
                )
                AS particular_tweet
            
            ON particular_tweet.liked_user_id = user.user_id

                
    `);

  if (pFollowingTweetsLikes.length === 0) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    res.status(200);
    res.send({ likes: pFollowingTweetsLikes.map((e) => e.username) });
  }
});

// API - 8
app.get("/tweets/:tweetId/replies/", authentication, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;

  const user = await db.get(
    `SELECT user_id FROM user WHERE username='${username}'`
  );

  const userId = user.user_id;
  //   const userId = 2;
  console.log(userId);

  const particularFollowingTweets = await db.all(`
  
            SELECT username,reply FROM USER
            INNER JOIN 
                (
                    SELECT * FROM 

                        (
                            SELECT * FROM follower
                            WHERE follower_user_id = ${userId}
                        )
                        AS followings
                        INNER JOIN
                        (   

                            SELECT
                                    p_tweet.tweet_id as tweet_id,
                                    p_tweet.user_id as tweeted_user_id,
                                    reply.user_id as replied_user_id,
                                    reply,
                                    p_tweet.tweet,
                                    date_time
                            FROM 
                                (
                                    SELECT * FROM tweet
                                    WHERE tweet_id = ${tweetId}
                                )
                                AS p_tweet
                            INNER JOIN reply
                            ON reply.tweet_id = p_tweet.tweet_id
                        )
                        AS tweets

                        ON tweets.tweeted_user_id = followings.following_user_id
                )
                AS particular_tweet
            
            ON particular_tweet.replied_user_id = user.user_id
    `);

  if (particularFollowingTweets.length === 0) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    res.status(200);
    res.send({ replies: particularFollowingTweets });
  }
});

// API - 9
app.get("/user/tweets/", authentication, async (req, res) => {
  const { username } = req;

  const user = await db.get(
    `SELECT user_id FROM user WHERE username='${username}'`
  );

  const userId = user.user_id;
  //   const userId = 2;
  console.log(user, userId);
  //   likes.tweet_id,

  const userTweets = await db.all(`
                SELECT
                    likes.tweet,
                    likes.likes,
                    replies.replies,
                    likes.date_time
                FROM
                        (
                            SELECT 
                                tweet.tweet_id,
                                tweet.tweet,
                                count(like_id) as likes,
                                date_time
                            FROM 
                                (
                                    SELECT * FROM tweet
                                    WHERE tweet.user_id = ${userId}
                                ) tweet
                                LEFT JOIN like
                            ON like.tweet_id = tweet.tweet_id

                            GROUP BY tweet.tweet_id
                        )
                        AS likes
                        INNER JOIN 

                        (
                            SELECT 
                                tweet.tweet_id,
                                count(reply_id) as replies
                            FROM 
                                (
                                    SELECT * FROM tweet
                                    WHERE tweet.user_id = ${userId}
                                ) tweet
                                LEFT JOIN reply
                            ON reply.tweet_id = tweet.tweet_id

                            GROUP BY tweet.tweet_id
                        )
                        AS replies

                        ON replies.tweet_id = likes.tweet_id
               
               
        
    `);

  if (userTweets === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    res.status(200);
    res.send(
      userTweets.map((eachUser) => ({
        // tweetId: eachUser.tweet_id,
        tweet: eachUser.tweet,
        likes: eachUser.likes,
        replies: eachUser.replies,
        dateTime: eachUser.date_time,
      }))
    );
  }
});

// API - 10
app.post("/user/tweets/", authentication, async (req, res) => {
  const { username } = req;
  const { tweet: tweetText } = req.body;

  const tweets = await db.get(`SELECT count(*) as tweets_count FROM tweet`);
  const tweetsCount = tweets.tweets_count + 1;

  const user = await db.get(
    `SELECT user_id FROM user WHERE username='${username}'`
  );

  const userId = user.user_id;
  console.log(userId, tweetsCount);

  let date = new Date();

  let dateString = `${date.getFullYear()}-${
    date.getMonth() + 1 < 10 ? "0" + (date.getMonth() + 1) : date.getMonth() + 1
  }-${date.getDate() < 10 ? "0" + date.getDate() : date.getDate()}`;

  let timeString = `${
    date.getHours() < 10 ? "0" + date.getHours() : date.getHours()
  }:${date.getMinutes()}:${date.getSeconds()}`;

  let dateTimeString = dateString + " " + timeString;
  console.log(dateTimeString, new Date(dateString));

  await db.run(`
            INSERT INTO tweet VALUES
              (
                  ${tweetsCount},
                  '${tweetText}',
                  ${userId},
                  '${dateTimeString}'
                  )`);
  res.send("Created a Tweet");
});

// API - 11
app.delete("/tweets/:tweetId/", authentication, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;

  const user = await db.get(
    `SELECT user_id FROM user WHERE username='${username}'`
  );

  const userId = user.user_id;
  const tweetIdOofUser = parseInt(tweetId);

  console.log(userId, tweetIdOofUser);
  let tweet = await db.get(
    `   SELECT * FROM 
                (
                    SELECT * FROM  tweet
                    WHERE tweet.user_id = ${userId}
                )
                AS tweets
            WHERE tweets.tweet_id = ${tweetId}
        `
  );

  if (tweet === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    db.run(`
            DELETE FROM tweet 
            WHERE tweet_id = ${tweetId}
        `);
    res.send("Tweet Removed");
  }
});

//GET ALL User's API
app.get("/users/", authentication, async (req, res) => {
  res.send(await db.all(`Select * from user`));
});

//All Tweets API
app.get("/tweets/", authentication, async (req, res) => {
  res.send(await db.all(`Select * from tweet`));
});

//All Follower API
app.get("/follower/", authentication, async (req, res) => {
  res.send(await db.all(`Select * from follower`));
});

//All Reply API
app.get("/replies/", authentication, async (req, res) => {
  res.send(await db.all(`Select * from reply`));
});
module.exports = app;

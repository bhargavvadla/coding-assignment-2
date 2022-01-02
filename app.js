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

const authentication = async (req, res, next) => {
  const authHeader = req.headers["authorization"];
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
};

app.post("/register/", async (req, res) => {
  const { username, password, name, gender } = req.body;

  const users = await db.get(`SELECT * FROM user WHERE username='${username}'`);

  if (users !== undefined) {
    res.status(400);
    res.send("User already exists");
  } else {
    const totalUsersCount = await db.all("SELECT count(*) as count FROM user");

    const usersCount = totalUsersCount[0].count;
    console.log(password);
    const strongPassword = password.length >= 6 ? true : false;

    if (strongPassword) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await db.run(`INSERT INTO user VALUES
            (${
              usersCount + 1
            },'${name}','${username}','${hashedPassword}', '${gender}')`);
      res.send("User created successfully");
    } else {
      res.status(400);
      res.send("Password is too short");
    }
  }
});

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

app.get("/users/", authentication, async (req, res) => {
  const users = await db.all(`SELECT * FROM user`);

  res.status(200);
  res.send(
    users.map((eachUser) => ({
      userId: eachUser.user_id,
      name: eachUser.name,
      username: eachUser.username,
      password: eachUser.password,
      gender: eachUser.gender,
    }))
  );
});

app.get("/user/tweets/feed/", authentication, async (req, res) => {
  const { username } = req;

  const userFollowingsTweets = await db.all(`

  SELECT DISTINCT username, tweet, date_time FROM user
  INNER JOIN 
  (
      SELECT * from tweet 
    INNER JOIN 
    (
      SELECT following_user_id FROM follower 
        INNER JOIN user ON
        follower.follower_user_id = user.user_id
    ) as following_table
    ON tweet.user_id = following_table.following_user_id
)
AS tweets
ON tweets.user_id = user.user_id
ORDER BY date_time DESC
LIMIT 4 
  `);

  res.status(200);
  res.send(
    userFollowingsTweets.map((eachUser) => ({
      username: eachUser.username,
      tweet: eachUser.tweet,
      dateTime: eachUser.date_time,
    }))
  );
});

app.get("/user/following/", authentication, async (req, res) => {
  const { username } = req;

  const user = await db.all(
    `SELECT user_id FROM user WHERE username='${username}'`
  );

  const userId = user[0]["user_id"];
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

app.get("/user/followers/", authentication, async (req, res) => {
  const { username } = req;
  const user = await db.all(
    `SELECT  user_id FROM user WHERE username='${username}'`
  );

  const userId = user[0]["user_id"];
  //   const userId = 2;

  const userFollowersNames = await db.all(`
        SELECT DISTINCT name FROM user
        INNER JOIN 
            (
                SELECT follower_id from  follower
                WHERE
                follower.following_user_id = ${userId}
            )as followers
        ON followers.follower_id = user.user_id
  `);

  res.status(200);
  res.send(
    userFollowersNames
    // userFollowersNames.map((eachUser) => ({
    //   name: eachUser.name,
    // }))
  );
});

app.get("/tweets/:tweetId/", authentication, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;

  const user = await db.all(
    `SELECT user_id FROM user WHERE username='${username}'`
  );

  const userId = user[0]["user_id"];
  console.log(userId, tweetId);

  const particularFollowingTweets = await db.all(`
SELECT 
    tweet, 
    count(followings_like.like_id) as likes,
    count(reply.reply) as reply,
    date_time
    FROM reply
    INNER JOIN 
    (
        SELECT * FROM like
        INNER JOIN 
        (
            SELECt * FROM 
                (
                    SELECT * FROM  tweet
                    INNER JOIN 
                    (
                        SELECT * FROM follower
                        WHERE
                        follower.follower_user_id = ${userId}

                    ) as followings_table
                    ON followings_table.following_user_id = tweet.user_id

                )AS all_followings_tweets
            WHERE all_followings_tweets.tweet_id = ${tweetId}
        )
        AS all_followings_tweets
        ON   all_followings_tweets.tweet_id = like.tweet_id
    )
    AS followings_like
    ON followings_like.tweet_id = reply.tweet_id
    GROUP BY reply.tweet_id
    `);

  if (particularFollowingTweets === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    res.status(200);
    res.send(particularFollowingTweets);
  }
});

app.get("/tweets/:tweetId/likes/", authentication, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;

  const particularFollowingTweets = await db.all(`
SELECT DISTINCT
user.username
 FROM user
INNER JOIN 
(  SELECT * FROM like
  INNER JOIN 
  (
    SELECT * FROM tweet 
  INNER JOIN 
  (
        SELECT * FROM  tweet
        INNER JOIN 
        (
            SELECT following_user_id FROM follower
            INNER JOIN user 
            on user.user_id = follower.following_user_id
        ) as followings_table

        ON followings_table.following_user_id =tweet.user_id

  )
  AS followings
  ON   followings.following_user_id = ${tweetId})
  AS followings_tweets

   ON followings_tweets.tweet_id = like.tweet_id)

  AS followings_like
  ON followings_like.tweet_id = user.user_id
    `);

  if (particularFollowingTweets.length === 0) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    res.status(200);
    res.send(particularFollowingTweets);
  }
});

app.get("/tweets/:tweetId/replies/", authentication, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;

  const particularFollowingTweets = await db.all(`
  SELECT DISTINCT username, reply FROM user
  INNER JOIN
  (
SELECT 
*
 FROM reply
INNER JOIN 
(  SELECT * FROM like
  INNER JOIN 
  (
    SELECT * FROM tweet 
  INNER JOIN 
  (
        SELECT * FROM  tweet
        INNER JOIN 
        (
            SELECT following_user_id FROM follower
            INNER JOIN user 
            on user.user_id = follower.following_user_id
        ) as followings_table

        ON followings_table.following_user_id =tweet.user_id

  )
  AS followings
  ON   followings.following_user_id = ${tweetId})
  AS followings_tweets

  ON followings_tweets.tweet_id = like.tweet_id)
  AS followings_like
  ON followings_like.user_id = reply.user_id)
  
  AS followings_reply
  ON followings_reply.user_id = user.user_id
    `);

  if (particularFollowingTweets.length === 0) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    res.status(200);
    res.send(particularFollowingTweets);
  }
});

app.get("/user/tweets/", authentication, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;

  const user = await db.all(
    `SELECT user_id FROM user WHERE username='${username}'`
  );

  const userId = user[0]["user_id"];
  //   const userId = 2;

  const particularFollowingTweets = await db.all(`
        SELECT 
        likes.tweet,
        count(likes.like_id) as likes,
        count(reply.reply_id) as reply,
        likes.date_time
        FROM reply
        INNER JOIN 
        (    SELECT * FROM like
            INNER JOIN 
            (
                SELECT * FROM tweet
                WHERE tweet.user_id = ${userId}
            )
            AS tweets
            ON like.tweet_id = tweets.tweet_id
        )
        AS likes
        ON likes.tweet_id = reply.tweet_id
        GROUP BY likes.tweet_id

    `);

  if (particularFollowingTweets.length === 0) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    res.status(200);
    res.send(
      particularFollowingTweets.map((eachUser) => ({
        tweet: eachUser.tweet,
        likes: eachUser.likes,
        reply: eachUser.reply,
        dateTime: eachUser.date_time,
      }))
    );
  }
});

app.get("/tweets/", async (req, res) => {
  res.send(await db.all(`Select * from tweet`));
});

app.post("/user/tweets/", authentication, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;
  const { tweet: tweetText } = req.body;

  const tweets = await db.all(`SELECT count(*) as tweets_count FROM tweet`);
  const tweetsCount = tweets[0]["tweets_count"] + 3;

  const user = await db.all(
    `SELECT user_id FROM user WHERE username='${username}'`
  );
  const userId = user[0]["user_id"];

  await db.run(`
    INSERT INTO tweet VALUES
      (
          ${tweetsCount},
          '${tweetText}',
          '${userId}',
          '${new Date()}'
      )
    `);
  res.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", authentication, async (req, res) => {
  const { username } = req;
  const { tweetId } = req.params;

  const user = await db.all(
    `SELECT user_id FROM user WHERE username='${username}'`
  );

  const userId = user[0]["user_id"];
  const tweetIdOofUser = parseInt(tweetId);

  if (!userId) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    await db.run(`
        DELETE FROM  tweet
        WHERE ${tweetId} IN 
            (SELECT tweet_id FROM tweet WHERE user_id = ${userId})
        `);
    res.send("Tweet Removed");
  }
});

module.exports = app;

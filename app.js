//jshint esversion:6
require('dotenv').config();//inicjujemy dotenv - do szyfrowania klucza
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require('express-session');
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate');

const app = express();

app.use(express.static("public"));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({
  extended: true
}));

// To jest kawałek kodu wzięty z dokumentacji tego express-session
app.use(session({
  secret: "Our little secret",
  resave: false,
  saveUninitialized: false,
}));

//Ten kod poniżej wzięty ze strony passport documentation
app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb://localhost:27017/userDB", {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
mongoose.set('useCreateIndex', true);

//To jest zmiana wymagana przez encryption - bardziej skomplikowany schema
const userSchema = new mongoose.Schema ({
  email: String,
  password: String,
  googleId: String// To jest do tego, żeby sprawdzić, czy ktoś z takim google id
  //juz sie zarejestrował w naszej bazie i nie będzie tworzyć nowych userów za kazdym
  //razem, jak się zarejestrujemy przez google. Odniesienie do tego w tej funkcji
  //findOrCreate
});

//To poniżej hashuje i saltuje nam hasło oraz zapisuje użytkowników w DB
//Dokumentacja w tym passport local mongoose
userSchema.plugin(passportLocalMongoose);
//Tutaj inicjujemy plugin z findOrCreate, który wykorzystuje się przy
//logowaniu z google account
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);

//Te 3 komendy poniżej też sa z tego passport local mongoose
passport.use(User.createStrategy());

//Serialize i deserialize jest niezbedne przy sessions.
//To tak jakby tworzenie ciastek i odczytywanie z nich info
//W przypadku google OAuth, kod jest trochę bardziej skomplikowany, niż przy local
passport.serializeUser(function(user, done) {
  done(null, user.id);
});
passport.deserializeUser(function(id, done){
  User.findById(id, function(err, user){
    done(err, user);
  });
});

//To zostało wklejone, czyli może nie działać
passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/secrets",
    //To poniżej wklejono z artykułu na githubie. Jednak zostało to oznaczone, jako
    //nieaktualne, więc może trzeba będzie to usunąć
    userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo'
  },
  //Znajduje usera konta google, albo tworzy nowego, jesli ten nie istnieje
  function(accessToken, refreshToken, profile, cb) {
    console.log(profile);
    //To findOrCreate to nie jest funkcja z MongoDB, tylko taki pseudocode od passport
    //Ale jest taki plugin, który my sobie zainstowaliśmy i on dodaje taką funkcję
    User.findOrCreate({ googleId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));

app.get("/", function(req, res) {
  res.render("home");
});

//To jest get request do okna logowania google, które wyskoczy
app.get("/auth/google",
  passport.authenticate('google', {scope: ["profile"]})
);

//Ten auth/google/ secrets  poniżej to nasze authorized URL które ustawiliśmy sobie w googlu
//Cały ten kod poniżj, ma na celu przekierować nas do odpowiedniej strony, jak już
//jesteśmy zalogowani
app.get("/auth/google/secrets",
passport.authenticate('google', {failureRedirect: '/login'}),
function(req, res){
  //Succesful authentication, redirect to secrets page
  res.redirect("/secrets");
});

app.get("/login", function(req, res) {
  res.render("login");
});

app.get("/register", function(req, res) {
  res.render("register");
});

//W tym poniżej chodzi o to, że jak użytkownik jest już zalogowany,
//to ma go logować od razu na jego konto, a jak nie, to przekierować
//do rejestracji
app.get("/secrets", function(req, res) {
  if(req.isAuthenticated()){
  res.render("secrets");
}else {
  res.redirect("/login");
}
});

app.get("/logout", function(req, res) {
  req.logout();
  res.redirect("/");
});

app.post("/register", function(req, res){
  //Kod poniżej wzięty z tego passport local mongoose
  User.register({username: req.body.username}, req.body.password, function(err, user){
    if(err){
      console.log(err);
      res.redirect("/register");
    }else{
      //To poniżej sprawdza, czy jestesmy tak jakby zalogowai w przeglądarce
      passport.authenticate("local")(req, res, function(){
        res.redirect("/secrets");
      });
    }
  });
});

app.post("/login", function(req, res){
  const user = new User({
    username: req.body.username,
    password: req.body.password
  });

  req.login(user, function(err){
    if(err){
      console.log(err);
    }else{
      passport.authenticate("local")(req, res, function(){
        res.redirect("/secrets");
      });
    }
  });

});


app.listen(3000, function() {
  console.log("Server started on port 300.");
});

//Poniżej kod z Facebooka

// <script>
//   window.fbAsyncInit = function() {
//     FB.init({
//       appId      : '{your-app-id}',
//       cookie     : true,
//       xfbml      : true,
//       version    : '{api-version}'
//     });
//
//     FB.AppEvents.logPageView();
//
//   };
//
//   (function(d, s, id){
//      var js, fjs = d.getElementsByTagName(s)[0];
//      if (d.getElementById(id)) {return;}
//      js = d.createElement(s); js.id = id;
//      js.src = "https://connect.facebook.net/en_US/sdk.js";
//      fjs.parentNode.insertBefore(js, fjs);
//    }(document, 'script', 'facebook-jssdk'));
// </script>

install Dependencies 
--npm install express,mongoose,validator,cors

->create a server file --server.js
create API Endpoints , app.use('/',(req,res)) ==>this handles all the routes after / ,but app.get('/about',(req,res))=> this handles only specific Routes

->Create a new cluster in MongoDB Atlas ,get its connection string and use it in the Server file and establish the connection between server and the Backend

->utils-- Validation -this contaiins teh input validation of details sent by user

->create the userSchema(used only to define the model) -- defines the strucutre of contents in the DB
->create the userModel inside schema - this is used for CRUD operations on DB --each time instances of this model are created

->create an API endpoint "/register" which validates the input from the client and saves the info into the DB;

->create API endpoint "/login" which checks if email already exists and accepts the details

->install bcrypt and include hashing the passwords 

->npm install jsonwebtoken cookie-parser  

------------------------------
Socket.io setup and code (server.js)

->import http from "http" -- 
->import socket from "socket.io"
->const server=http.createServer(app); -- to create a Http server 
->change app.listen at the bottom to server.listen
->configure cors for the server

setup all the code of socket.io in the socket.js file and use that function intializeSocket in the server.js
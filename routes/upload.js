var express = require("express");
var router = express.Router();
let { uploadImage, uploadExcel } = require("../utils/uploadHandler");
let exceljs = require("exceljs");
let path = require("path");
let crypto = require("crypto");
let categoriesModel = require("../schemas/categories");
let productModel = require("../schemas/products");
let inventoryModel = require("../schemas/inventories");
let userModel = require("../schemas/users");
let roleModel = require("../schemas/roles");
let { sendAccountCredentialsMail } = require("../utils/mailHandler");
let mongoose = require("mongoose");
let slugify = require("slugify");
//client ->upload->save

function generateRandomPassword(length = 16) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-={}[]<>?";
  const bytes = crypto.randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

router.post("/one_file", uploadImage.single("file"), function (req, res, next) {
  if (!req.file) {
    res.status(404).send({
      message: "file khong duoc de trong",
    });
  } else {
    res.send({
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size,
    });
  }
});
router.get("/:filename", function (req, res, next) {
  let pathFile = path.join(__dirname, "../uploads", req.params.filename);
  res.sendFile(pathFile);
});

router.post(
  "/multiple_files",
  uploadImage.array("files"),
  function (req, res, next) {
    if (!req.files) {
      res.status(404).send({
        message: "file khong duoc de trong",
      });
    } else {
      res.send(
        req.files.map((f) => {
          return {
            filename: f.filename,
            path: f.path,
            size: f.size,
          };
        }),
      );
    }
  },
);

router.post(
  "/excel",
  uploadExcel.single("file"),
  async function (req, res, next) {
    if (!req.file) {
      res.status(404).send({
        message: "file khong duoc de trong",
      });
    } else {
      //workbook->worksheet->row/column->cell
      let workbook = new exceljs.Workbook();
      let pathFile = path.join(__dirname, "../uploads", req.file.filename);
      await workbook.xlsx.readFile(pathFile);
      let worksheet = workbook.worksheets[0];
      let categories = await categoriesModel.find({});
      let categoriesMap = new Map();
      for (const category of categories) {
        categoriesMap.set(category.name, category._id);
      }
      let products = await productModel.find({});
      let getTitle = products.map((p) => p.title);
      let getSku = products.map((p) => p.sku);
      //Map key->value
      let result = [];
      for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
        let errorsInRow = [];
        const row = worksheet.getRow(rowIndex);
        let sku = row.getCell(1).value;
        let title = row.getCell(2).value;
        let category = row.getCell(3).value;
        let price = Number.parseInt(row.getCell(4).value);
        let stock = Number.parseInt(row.getCell(5).value);
        if (price < 0 || isNaN(price)) {
          errorsInRow.push("price la so duong");
        }
        if (stock < 0 || isNaN(stock)) {
          errorsInRow.push("stock la so duong");
        }
        if (!categoriesMap.has(category)) {
          errorsInRow.push("category khong hop le");
        }
        if (getTitle.includes(title)) {
          errorsInRow.push("title khong duoc trung");
        }
        if (getSku.includes(sku)) {
          errorsInRow.push("sku khong duoc trung");
        }
        if (errorsInRow.length > 0) {
          result.push(errorsInRow);
          continue;
        }
        let session = await mongoose.startSession();
        session.startTransaction();
        try {
          let newProduct = new productModel({
            sku: sku,
            title: title,
            slug: slugify(title, {
              replacement: "-",
              remove: undefined,
              lower: true,
            }),
            price: price,
            description: title,
            category: categoriesMap.get(category),
          });
          await newProduct.save({ session });
          let newInventory = new inventoryModel({
            product: newProduct._id,
            stock: stock,
          });
          await newInventory.save({ session });
          await newInventory.populate("product");
          await session.commitTransaction();
          await session.endSession();
          getTitle.push(title);
          getSku.push(sku);
          result.push(newInventory);
        } catch (error) {
          await session.abortTransaction();
          await session.endSession();
          result.push(error.message);
        }
      }
      res.send(result);
    }
  },
);

router.post(
  "/users/excel",
  uploadExcel.single("file"),
  async function (req, res, next) {
    if (!req.file) {
      return res.status(404).send({
        message: "file khong duoc de trong",
      });
    }

    try {
      let workbook = new exceljs.Workbook();
      let pathFile = path.join(__dirname, "../uploads", req.file.filename);
      await workbook.xlsx.readFile(pathFile);
      let worksheet = workbook.worksheets[0];

      let userRole = await roleModel.findOne({
        isDeleted: false,
        name: { $regex: /^user$/i },
      });

      if (!userRole) {
        userRole = await roleModel.create({
          name: "USER",
          description: "default user role",
        });
      }

      const usernamesInFile = new Set();
      const emailsInFile = new Set();
      const results = [];

      for (let rowIndex = 2; rowIndex <= worksheet.rowCount; rowIndex++) {
        const row = worksheet.getRow(rowIndex);
        const username = (row.getCell(1).text || "").trim();
        const email = (row.getCell(2).text || "").trim().toLowerCase();
        const errors = [];

        if (!username) {
          errors.push("username khong duoc de trong");
        }

        if (!email) {
          errors.push("email khong duoc de trong");
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (email && !emailRegex.test(email)) {
          errors.push("email sai dinh dang");
        }

        if (username && usernamesInFile.has(username)) {
          errors.push("username bi trung trong file");
        }

        if (email && emailsInFile.has(email)) {
          errors.push("email bi trung trong file");
        }

        if (errors.length > 0) {
          results.push({
            row: rowIndex,
            username,
            email,
            success: false,
            errors,
          });
          continue;
        }

        usernamesInFile.add(username);
        emailsInFile.add(email);

        try {
          const existedUser = await userModel.findOne({
            isDeleted: false,
            $or: [{ username: username }, { email: email }],
          });

          if (existedUser) {
            results.push({
              row: rowIndex,
              username,
              email,
              success: false,
              errors: ["username hoac email da ton tai"],
            });
            continue;
          }

          const plainPassword = generateRandomPassword(16);
          const newUser = new userModel({
            username,
            email,
            password: plainPassword,
            role: userRole._id,
          });
          await newUser.save();

          await sendAccountCredentialsMail(email, username, plainPassword);

          results.push({
            row: rowIndex,
            username,
            email,
            success: true,
            userId: newUser._id,
          });
        } catch (error) {
          results.push({
            row: rowIndex,
            username,
            email,
            success: false,
            errors: [error.message],
          });
        }
      }

      res.send(results);
    } catch (error) {
      res.status(400).send({ message: error.message });
    }
  },
);

module.exports = router;

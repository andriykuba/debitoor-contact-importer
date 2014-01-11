# Debitoor Contact Importer

This project was created for users of Debitoor to help them easily create invoices for their customers. [The main goal is import of user's email contacts from different sources into Debitoor](http://e-conomic.github.io/openvac/interview.html). Almost all program of email contacts management have option to export contacts as [CSV](http://en.wikipedia.org/wiki/Comma-separated_values) file. So CSV file was selected as the starting point for import of contacts into Debitoor. Project is developed as [REST API](http://en.wikipedia.org/wiki/Representational_state_transfer) for easy integrating with different systems.

- [Requirements](#requirements)
- [How it works](#how-it-works)
- [Authentication](#authentication)
- [Debitoor Authentication](#debitoor-authentication)
- [Contacts](#contacts)
  - [/api/v1.0/contacts](#api-v1-0-contacts)
    - [POST](#post)
    - [GET](#get)
- [Mapping Contacts to Customers](#mapping-contacts-to-customers)
  - [/api/v1.0/schememap](#api-v1-0-schememap)
    - [PUT](#put)
    - [GET](#get_1)
- [Import](#import)
  - [/api/v1.0/debitoor/customers/import](#api-v1-0-debitoor-customers-import)
    - [POST](#post_1)
- [Tests](#tests)
  - [Structure](#structure)
- [Possible Improvements](#possible-improvements)

## Requirements

[**Node.js**](http://nodejs.org/) for run, [**MongoDB**](http://www.mongodb.org/) for save and [**Mocha**](http://visionmedia.github.io/mocha/) for tests.

The configuration is in the `config/private.json` and the `config/public.json` files. The `config/private.json` file is used for store a secret properties such as a user passwords or the "client secret" of Debitoor API. It's a nice idea to exclude it from your repository. For example you could use `git update-index --assume-unchanged config/private.json` command right after first pull. 

## How it works

Authentication and Authorization are present, so more than one user could work with the application.

A user uploads the CSV file to the application. The file is parsed and store in the database as JSON array of contacts. The User can read contacts to check how they are parsed. Each file upload renew contacts, i.e. delete all contacts from the database and create new ones with the downloaded CSV.

CSV could have any fields. We need to map a contact from CSV with a customer from Debitoor. The user must put the matching scheme for the application.

The user could import contacts to Debitoor. Before that user needs to grant access for the our application to Debitoor. 

Take attention that this API is JSON-based. So do not forget to add `"Content-Type":"application/json"` header to all request except file upload. 

## Authentication

["Basic Authentication"](http://en.wikipedia.org/wiki/Basic_access_authentication) method was selected for authentification as simplest one. It's easy to change by changing `routes/users.auth` method to use authentication what you like. 

We use https protocol to provide more security for this type of authentication. You could found [dummy certificates](http://docs.nodejitsu.com/articles/HTTP/servers/how-to-create-a-HTTPS-server) in the `config\key` directory. It's fine to use it for testing purpose, but on the production environment we strictly recommend you to replace them by CA-signed certificates. Do not forget to exclude CA-signed certificates from repository.

Users and they passwords are stored in the `config/private.json` file as simple json array:

```json
{
	"users":[
		{"name": "user1", "password": "ghdjd123as"},
		{"name": "user2", "password": "asd890asd"},
		{"name": "user3", "password": "vfdfj89as"}
	]
}
```

User name is the user ID, so be careful - users with the same name will have access to the same data.

## Debitoor Authentication

[Debitoor use oAuth 2.0](https://github.com/e-conomic/debitoor-api/blob/master/pages/authentication.md) Authentication for access to the API. User need to grant access for the our application to Debitoor directly in the browser.

Need to take a few steps to allow the application to work with Debitoor. 

1. Go to the home page of application, i.e. `"/"`, and press "Grant access to Debitoor" link.
2. Login to Debitoor and Allow access for the application.
3. You will be redirected back to the home page with special code on that page.
4. Copy and paste this code in the `"/api/v1.0/debitoor/register"` API GET request. 

    GET request example:

    ```json
    {
    	"code":"asdasdasfasfskaflskf3945395837459asdasdas"
    }
    ```

These steps should be done only once (until it be rejected by the user from within Debitoor application). 

## Contacts

Only one requirements to the CSV file -  the column of headers must be present. We need headers for convert a contact to a customer.

### /api/v1.0/contacts

This is the endpoint of contacts. You could do POST or GET requests to this URL.

#### POST

Upload CSV file, clean the contacts collection, create new contacts on the base of CSV. Successfully if response code is 200. It also returns JSON object with property `complete`. The property always will be true as error will be thrown otherwise. This type of response is general for a POST or a PUT requests in this API.

CSV file example:

```
First Name,Middle Name,Last Name,Title,E-mail Address,Priority,Private,Categories
User Name 1,,Surname 1,,user@surname.com,Normal,,,
User Name 2,,Surname 2,,user@surname.com,Normal,,,
```

Response example:

```json
{
    "complete": true
}
```

#### GET

Return contacts as array of JSON objects.

Result of CSV parsing example:

```json
[
	{
		"Priority": "Normal",
		"E-mail Address": "user@surname.com",
		"Last Name": "Surname 1",
		"First Name": "User Name 1"
	},
	{
		"Priority": "Normal",
		"E-mail Address": "user@surname.com",
		"Last Name": "Surname 2",
		"First Name": "User Name 2"
	}
]
```

## Mapping Contacts to Customers

[JSON Schema](http://json-schema.org) of the matching scheme. This Schema is used only for description, validation does not implemented on the server.

```json
{
	"description": "The scheme of matching a contact to a customer",
	"required": true,
	"type": "object",
	"additionalProperties": false,
	"patternProperties": {
		".*": {
			"description": "property from the schema of customer within Debitoor",
			"required": false,
			"type": "object",
			"properties": {
				"map": {
					"description": "An array of some properties of contact. Property values ​​will be joined and set to the customer",
					"required": true,
					"type": "array",
					"items": {
						"type": "string"
					},
					"example": "[\"First Name\", \"Last Name\"]"
				},
				"delimeter":{
					"description": "Used as delimeter for joining \"map\"",
					"required": false,
					"type": "string",
					"example": ","
				},
				"default":{
					"description": "This value will be used if the \"map\" value is empty",
					"required": false,
					"type": {
						"description": "the same type as the type of customer property"
					},
					"example": "string"
				}
			},
			"example": "paymentTermsId",
		}
	}
}
```

We recommend that you add a non-empty `default` property for the [items that required for Debitoor](https://api.debitoor.com/api/v1.0/schemas/customer).

Matching scheme example:

```json
{
	"name": {
		"map": ["First Name", "Last Name"],
		"delimeter": " ",
		"default": "ENTER NAME PLEASE"
	},
	"paymentTermsId": {
		"default": 1
	},
	"countryCode":{
		"default": "DK"
	},
	"email":{
		"map": ["E-mail Address"]
	}
}
``` 

### /api/v1.0/schememap

This is the endpoint of matching scheme. You could do PUT or GET requests to this URL.

#### PUT

Puts the matching scheme in to the application. It will be stored in the database.

#### GET

Returns the current matching scheme.

## Import 

The application has all the contacts from the database, convert them into customers and post to Debitoor. We are importing email contacts, so we assume the email is the user ID. Debitoor customers can have the same email for different customers. This could cause the problem. Application proposing three way of solving them. 

1. `add` - just import all contacts.
2. `ignore` - imort contact only if there is no customer with the same email in Debitoor.
3. `update` - if the customer is on the same e-mail, then the customer will be updated with the values ​​of the contact. All other contacts just import. If there is more than one customer with the same email in Debitoor, then last one would be updated.

### /api/v1.0/debitoor/customers/import

This is the endpoint of the customer import. You could do POST request to this URL.

#### POST

Post customers to Debitoor. 

[JSON Schema](http://json-schema.org) of the request: 

```json
{
	"description": "The scheme of import contacts to Debitoor",
	"required": true,
	"type": "object",
	"additionalProperties": false,
	"properties": {
		"mergeRule":{
			"description": "The way to resolve merge conflicts between a contact and a customer",
			"required": true,
			"enum": [ 
				"add",
				"ignore",
				"update"
			],
			"example": "add"
		}		
	}
}
```

Request example:

```json
{
  "mergeRule":"add"
}
```

## Tests

We use [**Mocha**](http://visionmedia.github.io/mocha/), [**Should**](https://github.com/visionmedia/should.js) and [**Supertest**](https://github.com/visionmedia/supertest) for testing.

Main accent is done on the functional testing. We did test for all endpoints, including registration in Debitoor. In the process of tests we drop test database and delete all customers from Debitoor account. So be careful - do not test against useful accounts.

We do not recommend to change test database and test users in the `public.json` file. If you decide to change test user, do not forget to check that `test/tools.js` contains correct user name and password for `auth`, `authAnother`, `authWrong` variables.

Trivially you tests on another host than production. So it's better register a special "test" application on Debitoor for correct callback URL.

### Structure

As usual, our tests are situated in the `test` folder. This folder has `data` subfolder with some test data, they are too complicated to be included directly in the test code. A short description is:

1. `contacts.csv` - CSV file with contacts to be uploaded into the application.
2. `contacts-uploaded.json` - contacts parsed by the application.
3. `scheme.json` - the scheme of matching a contact to a customer.
4. `customers-imported.json` - customers parsed by the Debitoor.
5. `customers-imported-mask.json` - comparable fields of the customer exported from Debitoor.

The `test` folder itself contents tests

1. `tools.js` - useful for testing code is extracted into a separate file, so as not to interfere with the test code.
2. `functionsl.js` - functional tests. Test API calls and interaction with Debitoor.
3. `unit.js` - some unit tests to check some application modules

## Possible Improvements

1. Manage contacts.
  * Delete.
  * Import one contact into Debitoor.
  * Delete corresponded customer within Debitoor.

2. Create the simple UI for work with API from the browser.

3. Find customers within Ddebitoor that have the same email address.
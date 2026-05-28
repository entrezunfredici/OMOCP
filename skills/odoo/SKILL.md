---
name: odoo
description: Guide d'utilisation du plugin OMOCP — connecteur Odoo sécurisé pour OpenClaw
---

# Plugin OMOCP — Odoo pour OpenClaw

Ce plugin est un connecteur Odoo générique avec gestion des droits par profil.
Tout accès est contrôlé par des règles configurées par l'utilisateur dans l'interface OpenClaw.
L'agent ne peut rien lire, créer, modifier ou supprimer sans règle explicite.

## Outils disponibles

| Outil | Action |
| ----- | ------ |
| `odoo_sdk_read` | Lire des enregistrements |
| `odoo_sdk_create` | Créer un enregistrement |
| `odoo_sdk_update` | Modifier un ou plusieurs enregistrements |
| `odoo_sdk_delete` | Supprimer un ou plusieurs enregistrements |
| `odoo_sdk_list_models` | Lister les modèles disponibles d'un profil |
| `odoo_sdk_list_fields` | Lister les champs d'un modèle (introspection) |
| `odoo_list_connection_profiles` | Lister les profils de connexion configurés |
| `odoo_list_rights` | Lister les droits d'accès configurés |
| `odoo_config_validate` | Vérifier que la configuration est complète |

## Paramètres communs

Tous les outils CRUD prennent un `profile_id` : l'identifiant du profil de connexion configuré.

```yaml
profile_id: "mon-profil"
model: "project.task"
```

## Règles de sécurité

- Ne jamais supposer qu'un accès est autorisé.
- Ne jamais exposer ni demander les secrets (mots de passe, clés API).
- Toujours faire un `odoo_sdk_read` avant toute écriture pour confirmer l'état actuel.
- Ne jamais contourner `CONFIRMATION_REQUIRED`.
- Traiter la suppression comme irréversible — toujours demander confirmation explicite.

## Comportement requis pour les écritures

Avant tout create, update ou delete :

1. Utiliser `odoo_sdk_read` pour vérifier l'état actuel
2. Présenter clairement le changement prévu à l'utilisateur
3. N'agir qu'après une confirmation explicite
4. Si le backend retourne `CONFIRMATION_REQUIRED`, présenter les détails et relancer avec `confirmed: true`

## Codes d'erreur

| Code | Signification |
| ---- | ------------- |
| `AUTHORIZATION_DENIED` | Les règles ne permettent pas cette opération. |
| `CONFIRMATION_REQUIRED` | La règle exige `confirmed: true` avant d'agir. |
| `VALIDATION_ERROR` | Payload invalide ou modèle non supporté. |
| `SERVICE_ERROR` | Échec de connexion ou transport Odoo. |
| `NOT_FOUND` | Profil ou enregistrement introuvable. |
| `DENIED_BY_USER` | L'utilisateur a refusé via l'interface de confirmation. |

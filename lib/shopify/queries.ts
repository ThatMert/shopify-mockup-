/**
 * Shopify Admin GraphQL operasyonlari.
 * Hepsi `shopify-admin` skill'inin validator'i ile 2026-04 semasina karsi dogrulandi.
 */

export const STAGE_UPLOADS = /* GraphQL */ `
  mutation StageUploads($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const CREATE_PRODUCT = /* GraphQL */ `
  mutation CreateProductWithVariants($input: ProductSetInput!) {
    productSet(synchronous: true, input: $input) {
      product {
        id
        handle
        title
        media(first: 50) {
          nodes {
            id
            status
          }
        }
        variants(first: 100) {
          nodes {
            id
            title
            sku
            price
          }
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export const ADD_TO_COLLECTION = /* GraphQL */ `
  mutation AddToCollection($id: ID!, $productIds: [ID!]!) {
    collectionAddProducts(id: $id, productIds: $productIds) {
      collection {
        id
        title
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const FIND_COLLECTION = /* GraphQL */ `
  query FindCollection($query: String!) {
    collections(first: 10, query: $query) {
      nodes {
        id
        title
        handle
      }
    }
  }
`;

export const CREATE_COLLECTION = /* GraphQL */ `
  mutation CreateCollection($input: CollectionInput!) {
    collectionCreate(input: $input) {
      collection {
        id
        title
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export const SHOP_INFO = /* GraphQL */ `
  query ShopInfo {
    shop {
      name
      myshopifyDomain
      currencyCode
    }
  }
`;

/**
 * Staged upload ile yuklenen dosyalari kalici Files kaydina cevirir.
 * CSV'nin Image Src sutunu icin herkese acik cdn.shopify.com adresi buradan gelir.
 */
export const CREATE_FILES = /* GraphQL */ `
  mutation CreateFiles($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        fileStatus
        alt
        ... on MediaImage {
          image {
            url
            width
            height
          }
        }
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

/** Yuklenen dosyalarin hazir (READY) olup olmadigini ve CDN adresini sorar. */
export const FILE_STATUS = /* GraphQL */ `
  query FileStatus($ids: [ID!]!) {
    nodes(ids: $ids) {
      id
      ... on MediaImage {
        fileStatus
        image {
          url
        }
      }
    }
  }
`;

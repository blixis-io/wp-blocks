<?php
/** Native, no-retention form submission handler.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Rest;

use Blixis\Builder\Storage\Envelope;
use Blixis\Builder\Storage\MetaKeys;
use Blixis\Builder\Registry\SafeUrl;

\defined( 'ABSPATH' ) || exit;

/** Sends validated public form submissions to the configured WordPress admin email. */
final class FormSubmissionController {
	private const ACTION = 'blx_submit_form';
	private const LIMIT  = 5;

	/** Register public and authenticated submit handlers. */
	public static function hooks(): void {
		\add_action( 'admin_post_' . self::ACTION, [ self::class, 'handle' ] );
		\add_action( 'admin_post_nopriv_' . self::ACTION, [ self::class, 'handle' ] );
	}

	/** Process a submission without persisting its content. */
	public static function handle(): void {
		$post_id = isset( $_POST['post_id'] ) ? \absint( $_POST['post_id'] ) : 0; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Verified below with a form-bound nonce.
		$form_id = isset( $_POST['form_id'] ) && \is_string( $_POST['form_id'] ) ? \sanitize_key( \wp_unslash( $_POST['form_id'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Verified below with a form-bound nonce.
		$status  = 'error';
		$post    = $post_id > 0 ? \get_post( $post_id ) : null;
		$referer = $post instanceof \WP_Post ? \get_permalink( $post ) : \home_url( '/' );
		$nonce   = isset( $_POST['_wpnonce'] ) && \is_string( $_POST['_wpnonce'] ) ? \sanitize_text_field( \wp_unslash( $_POST['_wpnonce'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Verified below.
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || ! $post instanceof \WP_Post || 'publish' !== $post->post_status || '' === $form_id || ! \wp_verify_nonce( $nonce, self::nonce_action( $post_id, $form_id ) ) ) {
			self::redirect( $referer, $form_id, $status );
		}

		$definition = self::published_form( $post_id, $form_id );
		if ( null === $definition ) {
			self::redirect( $referer, $form_id, $status );
		}

		$trap  = isset( $_POST['company_website'] ) && \is_string( $_POST['company_website'] ) ? \trim( \wp_unslash( $_POST['company_website'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Verified above.
		$input = isset( $_POST['fields'] ) && \is_array( $_POST['fields'] ) ? \wp_unslash( $_POST['fields'] ) : []; // phpcs:ignore WordPress.Security.NonceVerification.Missing -- Verified above.
		if ( '' !== $trap || ! self::valid_fields( $definition['fields'], $input ) ) {
			self::redirect( $referer, $form_id, $status );
		}
		if ( ! self::rate_limit( $post_id, $form_id, $definition['rateLimitPerMinute'] ) ) {
			self::redirect( $referer, $form_id, $status );
		}

		$recipient = \sanitize_email( (string) \get_option( 'admin_email', '' ) );
		if ( ! \is_email( $recipient ) ) {
			self::redirect( $referer, $form_id, $status );
		}
		$lines = [];
		foreach ( $definition['fields'] as $name => $field ) {
			if ( 'password-field' === $field['type'] || ! isset( $input[ $name ] ) ) {
				continue;
			}
			$value   = $input[ $name ];
			$values  = \is_array( $value ) ? \array_slice( $value, 0, 20 ) : [ $value ];
			$values  = \array_filter( $values, 'is_scalar' );
			$label   = (string) $field['label'];
			$lines[] = $label . ': ' . \sanitize_textarea_field( \implode( ', ', \array_map( 'strval', $values ) ) );
		}
		$subject   = \sprintf( '[%s] Form submission', \sanitize_text_field( (string) \get_bloginfo( 'name' ) ) );
		$mail_sent = \wp_mail( $recipient, $subject, \implode( "\n", $lines ), [ 'Content-Type: text/plain; charset=UTF-8' ] );
		if ( $mail_sent ) {
			$status = 'success';
		}
		self::redirect( $referer, $form_id, $status );
	}

	/** Find the matching form and its safe field allowlist in the live layout snapshot.
	 *
	 * @param int    $post_id Page id.
	 * @param string $form_id Stable form id.
	 * @return ?array{rateLimitPerMinute:int,fields:array<string,array{type:string,label:string,required:bool,minLength:int,maxLength:int}>}
	 */
	private static function published_form( int $post_id, string $form_id ): ?array {
		$pointer_raw = \get_post_meta( $post_id, MetaKeys::PUBLISHED, true );
		$pointer     = \is_string( $pointer_raw ) ? Envelope::decode( $pointer_raw, MetaKeys::PUBLISHED ) : null;
		$revision    = $pointer->{'publishedLayoutRevision'} ?? null;
		if ( ! $pointer instanceof \stdClass || ! \is_int( $revision ) || $revision < 1 ) {
			return null;
		}
		$key        = MetaKeys::snap_layout( $revision );
		$layout_raw = \get_post_meta( $post_id, $key, true );
		$layout     = \is_string( $layout_raw ) ? Envelope::decode( $layout_raw, $key ) : null;
		$stack      = $layout instanceof \stdClass && \is_array( $layout->root ?? null ) ? $layout->root : [];
		$visited    = 0;
		while ( [] !== $stack && $visited++ < 5000 ) {
			$node = \array_pop( $stack );
			if ( ! $node instanceof \stdClass ) {
				continue;
			}
			$children = \is_array( $node->children ?? null ) ? $node->children : [];
			foreach ( $children as $child ) {
				$stack[] = $child;
			}
			$type  = $node->type ?? '';
			$props = $node->props ?? null;
			if ( ! \in_array( $type, [ 'blixis/form', 'blixis/contact-form', 'blixis/newsletter-signup' ], true ) || ! $props instanceof \stdClass ) {
				continue;
			}
			$form_props = \get_object_vars( $props );
			$config_id  = $form_props['formId'] ?? 'contact';
			if ( ! \is_string( $config_id ) || $config_id !== $form_id ) {
				continue;
			}
			if ( 'captcha' === ( $form_props['spamProtection'] ?? 'honeypot' ) || isset( $form_props['endpointRef'] ) ) {
				return null;
			}
			$fields = [];
			foreach ( $children as $child ) {
				if ( $child instanceof \stdClass && 'blixis/password-field' === ( $child->type ?? '' ) ) {
					return null;
				}
				if ( ! $child instanceof \stdClass || ! \in_array( $child->type ?? '', [ 'blixis/text-field', 'blixis/email-field', 'blixis/phone-field', 'blixis/number-field', 'blixis/url-field', 'blixis/search-field', 'blixis/hidden-field' ], true ) || ! ( $child->props ?? null ) instanceof \stdClass ) {
					continue;
				}
				$field_props = \get_object_vars( $child->props );
				$name        = $field_props['name'] ?? '';
				$translated  = self::published_value( $post_id, $pointer, $child->id, 'label' );
				$label       = $translated ?? $field_props['label'] ?? $field_props['ariaLabel'] ?? 'Field';
				$validation  = $field_props['validation'] ?? null;
				$validation  = $validation instanceof \stdClass ? \get_object_vars( $validation ) : [];
				$field_type  = \substr( (string) $child->type, 7 );
				$max_length  = \is_int( $validation['maxLength'] ?? null ) ? \max( 1, \min( 10000, $validation['maxLength'] ) ) : 255;
				if ( 'phone-field' === $field_type ) {
					$max_length = \min( 32, $max_length );
				}
				if ( ! \is_string( $name ) || 1 !== \preg_match( '/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/D', $name ) || ! \is_string( $label ) ) {
					continue;
				}
				$fields[ $name ] = [
					'type'      => $field_type,
					'label'     => \sanitize_text_field( $label ),
					'required'  => true === ( $field_props['required'] ?? false ),
					'minLength' => \is_int( $validation['minLength'] ?? null ) ? \max( 0, \min( 10000, $validation['minLength'] ) ) : 0,
					'maxLength' => $max_length,
				];
			}
			return [] !== $fields ? [
				'rateLimitPerMinute' => \is_int( $form_props['rateLimitPerMinute'] ?? null ) ? \max( 1, \min( 60, $form_props['rateLimitPerMinute'] ) ) : self::LIMIT,
				'fields'             => $fields,
			] : null;
		}
		return null;
	}

	/** Resolve one translated field property from its published locale stream, defaulting to the source locale.
	 *
	 * @param int       $post_id Published page id.
	 * @param \stdClass $pointer Publication pointer.
	 * @param string    $element_id Element id.
	 * @param string    $property Translatable property.
	 * @return ?string
	 */
	private static function published_value( int $post_id, \stdClass $pointer, string $element_id, string $property ): ?string {
		$locales = $pointer->locales ?? null;
		if ( ! $locales instanceof \stdClass ) {
			return null;
		}
		$default    = $pointer->{'defaultLocale'} ?? '';
		$candidates = [ \function_exists( 'get_locale' ) ? \get_locale() : '', \is_string( $default ) ? $default : '' ];
		foreach ( \array_unique( $candidates ) as $locale ) {
			if ( ! MetaKeys::is_valid_locale( $locale ) ) {
				continue;
			}
			$entry    = $locales->$locale ?? null;
			$revision = $entry instanceof \stdClass ? ( $entry->{'contentSnapshot'} ?? null ) : null;
			if ( ! \is_int( $revision ) || $revision < 1 ) {
				continue;
			}
			$key    = MetaKeys::snap_content( $locale, $revision );
			$raw    = \get_post_meta( $post_id, $key, true );
			$data   = \is_string( $raw ) ? Envelope::decode( $raw, $key ) : null;
			$values = $data instanceof \stdClass && ( $data->entries ?? null ) instanceof \stdClass ? ( $data->entries->$element_id ?? null ) : null;
			$values = $values instanceof \stdClass && ( $values->values ?? null ) instanceof \stdClass ? $values->values : null;
			$value  = $values instanceof \stdClass ? ( $values->$property ?? null ) : null;
			if ( \is_string( $value ) ) {
				return $value;
			}
		}
		return null;
	}

	/** Validate names and values against the live field allowlist.
	 *
	 * @param array<string,array{type:string,label:string,required:bool,minLength:int,maxLength:int}> $allowed Field schema.
	 * @param array<mixed>                                                                            $input Submitted values.
	 */
	private static function valid_fields( array $allowed, array $input ): bool {
		if ( [] === $input || \count( $input ) > \count( $allowed ) ) {
			return false;
		}
		foreach ( $input as $name => $value ) {
			if ( ! \is_string( $name ) || ! isset( $allowed[ $name ] ) || ! \is_scalar( $value ) || \strlen( (string) $value ) > 10000 ) {
				return false;
			}
			if ( \strlen( (string) $value ) > $allowed[ $name ]['maxLength'] || \strlen( (string) $value ) < $allowed[ $name ]['minLength'] ) {
				return false;
			}
			if ( 'email-field' === $allowed[ $name ]['type'] && '' !== (string) $value && ! \is_email( (string) $value ) ) {
				return false;
			}
			if ( 'number-field' === $allowed[ $name ]['type'] && '' !== (string) $value && ! \is_numeric( $value ) ) {
				return false;
			}
			if ( 'phone-field' === $allowed[ $name ]['type'] && '' !== (string) $value && 1 !== \preg_match( '/^\+?[0-9(). -]{3,32}$/D', (string) $value ) ) {
				return false;
			}
			if ( 'url-field' === $allowed[ $name ]['type'] && '' !== (string) $value && ! SafeUrl::accepts( (string) $value ) ) {
				return false;
			}
		}
		foreach ( $allowed as $name => $field ) {
			if ( $field['required'] && ( ! isset( $input[ $name ] ) || '' === \trim( (string) $input[ $name ] ) ) ) {
				return false;
			}
		}
		return true;
	}

	/** Apply a short per-IP/form rate limit without storing raw addresses or submissions.
	 *
	 * @param int    $post_id Page id.
	 * @param string $form_id Form id.
	 * @param int    $limit Requests per minute.
	 */
	private static function rate_limit( int $post_id, string $form_id, int $limit ): bool {
		$address = isset( $_SERVER['REMOTE_ADDR'] ) && \is_string( $_SERVER['REMOTE_ADDR'] ) ? $_SERVER['REMOTE_ADDR'] : '';
		$bucket  = 'blxform_' . \substr( \hash_hmac( 'sha256', $post_id . '|' . $form_id . '|' . $address, \wp_salt( 'auth' ) ), 0, 32 );
		$count   = (int) \get_transient( $bucket );
		if ( $count >= $limit ) {
			return false;
		}
		\set_transient( $bucket, $count + 1, MINUTE_IN_SECONDS );
		return true;
	}

	/** Redirect to a same-site result URL without echoing submitted values.
	 *
	 * @param string $url Return URL.
	 * @param string $form_id Form id.
	 * @param string $status Result.
	 */
	private static function redirect( string $url, string $form_id, string $status ): never {
		$url = \add_query_arg(
			[
				'form'   => \sanitize_key( $form_id ),
				'status' => 'success' === $status ? 'success' : 'error',
			],
			$url
		);
		\nocache_headers();
		\wp_safe_redirect( $url );
		exit;
	}

	/** Nonce action bound to one published page and form.
	 *
	 * @param int    $post_id Published post id.
	 * @param string $form_id Stable form id.
	 */
	public static function nonce_action( int $post_id, string $form_id ): string {
		return 'blx_form_submission_' . $post_id . '_' . $form_id;
	}
}

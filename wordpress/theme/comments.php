<?php
/**
 * Comments: the list and the form. Hidden for password-protected posts that are not unlocked.
 *
 * @package Blixis\Theme
 */

if ( post_password_required() ) {
	return;
}
?>
<section id="comments" class="comments-area">
	<?php if ( have_comments() ) : ?>
		<h2 class="comments-title">
			<?php
			printf(
				/* translators: %s: number of comments. */
				esc_html( _n( '%s comment', '%s comments', (int) get_comments_number(), 'blixis' ) ),
				esc_html( number_format_i18n( (int) get_comments_number() ) )
			);
			?>
		</h2>
		<ol class="comment-list">
			<?php wp_list_comments( array( 'style' => 'ol' ) ); ?>
		</ol>
		<?php the_comments_navigation(); ?>
	<?php endif; ?>
	<?php comment_form(); ?>
</section>
